import { AccountNotArchivedError, AccountNotFoundError, ProtectedAccountError } from "./errors.js";
import { getRuntime } from "./runtime.js";
import { getToolDefinition, toolRegistry, type ToolDefinition } from "./tool-registry.js";
import { ANALYSIS_VERSION, analysisLabels } from "./analysis/labels.js";
import type { AccountRecord, ArchiveScopeKind, ArchiveScopeRecord, IngestSummary } from "./provider-types.js";

type ToolInput = Record<string, unknown>;

const POST_READ_COST = 0.005;
const USER_READ_COST = 0.01;

async function resolveRemoteIdentity(input: { username?: string; userId?: string }) {
  const runtime = await getRuntime();
  const client = runtime.getXClient();

  if (input.username) {
    return client.getUserByUsername(input.username);
  }
  if (input.userId) {
    return client.getUserById(input.userId);
  }

  throw new AccountNotFoundError("username or userId is required.");
}

async function resolveArchivedIdentity(input: { username?: string; userId?: string }) {
  const runtime = await getRuntime();
  if (input.userId) {
    return runtime.database.getAccountByUserId(input.userId);
  }
  if (input.username) {
    return runtime.database.getAccountByUsername(input.username);
  }
  return null;
}

function finalizeCost(postsConsumed: number, userReads = 0) {
  return Number((postsConsumed * POST_READ_COST + userReads * USER_READ_COST).toFixed(4));
}

function buildFilters(input: {
  startTime?: string;
  endTime?: string;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
  excludeQuotes?: boolean;
}) {
  return {
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    excludeReplies: !!input.excludeReplies,
    excludeRetweets: !!input.excludeRetweets,
    excludeQuotes: !!input.excludeQuotes
  };
}

function buildIngestSummary(input: Partial<IngestSummary> & Pick<IngestSummary, "mode" | "queryType" | "searchMode">): IngestSummary {
  return {
    account: null,
    requestedCount: null,
    fetchedCount: 0,
    newCount: 0,
    requestsCount: 0,
    postsConsumed: 0,
    estimatedCostUsd: 0,
    nextToken: null,
    estimateOnly: false,
    writePerformed: false,
    cacheHit: false,
    remoteFetchNeeded: true,
    localMatchedCount: 0,
    missingCount: 0,
    fetchStrategy: "remote-window",
    coverageScope: null,
    queryText: null,
    countEstimate: null,
    filters: {
      startTime: null,
      endTime: null,
      excludeReplies: false,
      excludeRetweets: false,
      excludeQuotes: false
    },
    ...input
  };
}

function estimateTimelineCount(account: AccountRecord, targetCount: number) {
  const remoteTotal = account.postCount ?? targetCount;
  return Math.min(targetCount, Math.max(remoteTotal, 0));
}

function buildOriginalPostsQuery(account: AccountRecord) {
  return `(from:${account.username}) -is:reply -is:retweet -is:quote`;
}

function buildScopeKey(input: Record<string, unknown>) {
  return JSON.stringify(input);
}

function buildCoverageScope(scope: ArchiveScopeRecord | null) {
  if (!scope) {
    return null;
  }

  return {
    scopeKey: scope.scopeKey,
    scopeKind: scope.scopeKind,
    coverageComplete: scope.coverageComplete
  };
}

function getLabelTitle(labelName: string) {
  return analysisLabels.find(label => label.label === labelName)?.titleTr || labelName;
}

function mapScopeContentType(scope: ArchiveScopeRecord) {
  if (scope.scopeKind === "original_latest" || scope.scopeKind === "original_window") {
    return "original_posts";
  }
  if (scope.scopeKind === "search_latest" || scope.scopeKind === "search_window") {
    return "search_results";
  }
  return "all_posts";
}

function mapScopeRequestMode(scope: ArchiveScopeRecord) {
  if (
    scope.scopeKind === "timeline_latest" ||
    scope.scopeKind === "original_latest" ||
    scope.scopeKind === "search_latest"
  ) {
    return "latest";
  }
  return "window";
}

function buildScopeOverview(scope: ArchiveScopeRecord) {
  const requestMode = mapScopeRequestMode(scope);
  const contentType = mapScopeContentType(scope);

  return {
    scopeKey: scope.scopeKey,
    scopeKind: scope.scopeKind,
    contentType,
    requestMode,
    requestWindow: requestMode === "window" ? {
      startTime: scope.startTime,
      endTime: scope.endTime
    } : null,
    coveredRange: {
      newestPostId: scope.newestPostId,
      newestPostAt: scope.newestPostAt,
      oldestPostId: scope.oldestPostId,
      oldestPostAt: scope.oldestPostAt
    },
    localPostCount: scope.localPostCount,
    coverageComplete: scope.coverageComplete,
    includesReplies: !scope.excludeReplies,
    includesRetweets: !scope.excludeRetweets,
    includesQuotes: !scope.excludeQuotes,
    searchMode: scope.searchMode,
    queryText: scope.queryText
  };
}

function getMissingCount(targetCount: number, localMatchedCount: number) {
  return Math.max(targetCount - localMatchedCount, 0);
}

function buildAccountScopeRecord(input: {
  scopeKey: string;
  accountUserId: string;
  scopeKind: ArchiveScopeKind;
  startTime?: string | null;
  endTime?: string | null;
  excludeReplies: boolean;
  excludeRetweets: boolean;
  excludeQuotes: boolean;
  newestPostId: string | null;
  newestPostAt: string | null;
  oldestPostId: string | null;
  oldestPostAt: string | null;
  localPostCount: number;
  coverageComplete: boolean;
}): ArchiveScopeRecord {
  return {
    scopeKey: input.scopeKey,
    accountUserId: input.accountUserId,
    scopeKind: input.scopeKind,
    queryText: null,
    searchMode: null,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    excludeReplies: input.excludeReplies,
    excludeRetweets: input.excludeRetweets,
    excludeQuotes: input.excludeQuotes,
    newestPostId: input.newestPostId,
    newestPostAt: input.newestPostAt,
    oldestPostId: input.oldestPostId,
    oldestPostAt: input.oldestPostAt,
    localPostCount: input.localPostCount,
    coverageComplete: input.coverageComplete,
    updatedAt: new Date().toISOString()
  };
}

function buildSearchScopeRecord(input: {
  scopeKey: string;
  queryText: string;
  searchMode: "recent" | "full_archive";
  scopeKind: ArchiveScopeKind;
  startTime?: string | null;
  endTime?: string | null;
  newestPostId: string | null;
  newestPostAt: string | null;
  oldestPostId: string | null;
  oldestPostAt: string | null;
  localPostCount: number;
  coverageComplete: boolean;
  accountUserId?: string | null;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
  excludeQuotes?: boolean;
}): ArchiveScopeRecord {
  return {
    scopeKey: input.scopeKey,
    accountUserId: input.accountUserId || null,
    scopeKind: input.scopeKind,
    queryText: input.queryText,
    searchMode: input.searchMode,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    excludeReplies: !!input.excludeReplies,
    excludeRetweets: !!input.excludeRetweets,
    excludeQuotes: !!input.excludeQuotes,
    newestPostId: input.newestPostId,
    newestPostAt: input.newestPostAt,
    oldestPostId: input.oldestPostId,
    oldestPostAt: input.oldestPostAt,
    localPostCount: input.localPostCount,
    coverageComplete: input.coverageComplete,
    updatedAt: new Date().toISOString()
  };
}

async function backfillAccount(input: {
  username?: string;
  userId?: string;
  targetCount: number;
  startTime?: string;
  endTime?: string;
  excludeReplies: boolean;
  excludeRetweets: boolean;
  estimateOnly: boolean;
}): Promise<{ sync: IngestSummary }> {
  const runtime = await getRuntime();
  const client = runtime.getXClient();
  const archivedAccount = await resolveArchivedIdentity(input);
  const scopeKind: ArchiveScopeKind = input.startTime || input.endTime ? "timeline_window" : "timeline_latest";
  const account = archivedAccount || await resolveRemoteIdentity(input);
  const userReads = archivedAccount ? 0 : 1;
  const scopeKey = buildScopeKey({
    scopeKind,
    accountUserId: account.userId,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    excludeReplies: !!input.excludeReplies,
    excludeRetweets: !!input.excludeRetweets,
    excludeQuotes: false
  });
  const existingScope = runtime.database.getArchiveScope(scopeKey) || (() => {
    if (!archivedAccount) {
      return null;
    }
    const stats = runtime.database.getAccountScopeStats({
      accountUserId: account.userId,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: input.excludeReplies,
      excludeRetweets: input.excludeRetweets,
      excludeQuotes: false
    });

    if (stats.totalCount === 0) {
      return null;
    }

    return buildAccountScopeRecord({
      scopeKey,
      accountUserId: account.userId,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: input.excludeReplies,
      excludeRetweets: input.excludeRetweets,
      excludeQuotes: false,
      newestPostId: stats.newestPostId,
      newestPostAt: stats.newestPostAt,
      oldestPostId: stats.oldestPostId,
      oldestPostAt: stats.oldestPostAt,
      localPostCount: stats.totalCount,
      coverageComplete: true
    });
  })();
  const localMatchedCount = existingScope?.localPostCount || 0;
  const missingCount = getMissingCount(input.targetCount, localMatchedCount);

  if (account.protected) {
    throw new ProtectedAccountError(account.username);
  }

  const countEstimate = input.estimateOnly
    ? (missingCount === 0 ? localMatchedCount : estimateTimelineCount(account, missingCount))
    : null;
  if (input.estimateOnly) {
    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "timeline",
        searchMode: null,
        account,
        requestedCount: input.targetCount,
        requestsCount: userReads,
        estimatedCostUsd: missingCount === 0 ? 0 : finalizeCost(countEstimate || missingCount, userReads),
        estimateOnly: true,
        writePerformed: false,
        countEstimate,
        cacheHit: missingCount === 0,
        remoteFetchNeeded: missingCount > 0,
        localMatchedCount,
        missingCount,
        fetchStrategy: missingCount === 0 ? "local-only" : input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(existingScope),
        filters: buildFilters(input)
      })
    };
  }

  if (missingCount === 0) {
    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "timeline",
        searchMode: null,
        account,
        requestedCount: input.targetCount,
        estimatedCostUsd: 0,
        estimateOnly: false,
        writePerformed: false,
        cacheHit: true,
        remoteFetchNeeded: false,
        localMatchedCount,
        missingCount: 0,
        fetchStrategy: "local-only",
        coverageScope: buildCoverageScope(existingScope),
        filters: buildFilters(input)
      })
    };
  }

  runtime.database.upsertAccount(account);
  const syncRun = runtime.database.startSyncRun({
    accountUserId: account.userId,
    mode: "backfill",
    requestedCount: input.targetCount,
    queryType: "timeline",
    searchMode: null,
    estimateOnly: false,
    queryText: null,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });

  let fetchedCount = 0;
  let newCount = 0;
  let postsConsumed = 0;
  let requestsCount = userReads;
  let nextToken: string | null = null;
  const collected = [];

  try {
    while (fetchedCount < missingCount) {
      const remaining = missingCount - fetchedCount;
      const page = await client.getTimeline({
        account,
        maxResults: Math.min(100, remaining),
        nextToken: nextToken || undefined,
        untilId: !input.startTime && !input.endTime ? existingScope?.oldestPostId || undefined : existingScope?.oldestPostId || undefined,
        startTime: input.startTime,
        endTime: input.endTime,
        excludeReplies: input.excludeReplies,
        excludeRetweets: input.excludeRetweets
      });

      const boundedPosts = page.posts.slice(0, remaining);

      requestsCount += 1;
      postsConsumed += page.posts.length;
      fetchedCount += boundedPosts.length;
      collected.push(...boundedPosts);
      nextToken = page.nextToken;

      if (!nextToken || page.posts.length === 0 || boundedPosts.length < page.posts.length) {
        break;
      }
    }

    newCount = runtime.database.upsertPosts(collected);
    const newestPost = existingScope?.newestPostId
      ? {
          postId: existingScope.newestPostId,
          createdAt: existingScope.newestPostAt
        }
      : collected[0]
        ? { postId: collected[0].postId, createdAt: collected[0].createdAt }
        : null;
    const oldestPost = collected.length > 0
      ? { postId: collected[collected.length - 1]?.postId || null, createdAt: collected[collected.length - 1]?.createdAt || null }
      : existingScope
        ? { postId: existingScope.oldestPostId, createdAt: existingScope.oldestPostAt }
        : null;
    const currentScope = buildAccountScopeRecord({
      scopeKey,
      accountUserId: account.userId,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: input.excludeReplies,
      excludeRetweets: input.excludeRetweets,
      excludeQuotes: false,
      newestPostId: newestPost?.postId || null,
      newestPostAt: newestPost?.createdAt || null,
      oldestPostId: oldestPost?.postId || null,
      oldestPostAt: oldestPost?.createdAt || null,
      localPostCount: runtime.database.countPostsForAccountScope({
        accountUserId: account.userId,
        startTime: input.startTime || null,
        endTime: input.endTime || null,
        excludeReplies: input.excludeReplies,
        excludeRetweets: input.excludeRetweets,
        excludeQuotes: false
      }),
      coverageComplete: !nextToken || !input.startTime && !input.endTime
    });
    runtime.database.upsertArchiveScope(currentScope);

    if (scopeKind === "timeline_latest" && newestPost?.postId) {
      runtime.database.updateSyncState({
        accountUserId: account.userId,
        lastSyncedPostId: newestPost.postId,
        lastSyncedPostAt: newestPost.createdAt || null,
        mode: "backfill"
      });
    }

    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed, userReads),
      status: "completed"
    });

    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "timeline",
        searchMode: null,
        account,
        requestedCount: input.targetCount,
        fetchedCount,
        newCount,
        requestsCount,
        postsConsumed,
        estimatedCostUsd: finalizeCost(postsConsumed, userReads),
        nextToken,
        estimateOnly: false,
        writePerformed: true,
        cacheHit: false,
        remoteFetchNeeded: true,
        localMatchedCount,
        missingCount,
        fetchStrategy: input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(currentScope),
        countEstimate,
        filters: buildFilters(input)
      })
    };
  } catch (error) {
    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed, userReads),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function backfillOriginalAccount(input: {
  username?: string;
  userId?: string;
  searchMode: "recent" | "full_archive";
  targetCount: number;
  startTime?: string;
  endTime?: string;
  estimateOnly: boolean;
}): Promise<{ sync: IngestSummary }> {
  const runtime = await getRuntime();
  const client = runtime.getXClient();
  const archivedAccount = await resolveArchivedIdentity(input);
  const account = archivedAccount || await resolveRemoteIdentity(input);
  const userReads = archivedAccount ? 0 : 1;
  const scopeKind: ArchiveScopeKind = input.startTime || input.endTime ? "original_window" : "original_latest";
  const scopeKey = buildScopeKey({
    scopeKind,
    accountUserId: account.userId,
    searchMode: input.searchMode,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });
  const existingScope = runtime.database.getArchiveScope(scopeKey) || (() => {
    if (!archivedAccount) {
      return null;
    }
    const stats = runtime.database.getAccountScopeStats({
      accountUserId: account.userId,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: true,
      excludeRetweets: true,
      excludeQuotes: true
    });

    if (stats.totalCount === 0) {
      return null;
    }

    return buildAccountScopeRecord({
      scopeKey,
      accountUserId: account.userId,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: true,
      excludeRetweets: true,
      excludeQuotes: true,
      newestPostId: stats.newestPostId,
      newestPostAt: stats.newestPostAt,
      oldestPostId: stats.oldestPostId,
      oldestPostAt: stats.oldestPostAt,
      localPostCount: stats.totalCount,
      coverageComplete: true
    });
  })();
  const localMatchedCount = existingScope?.localPostCount || 0;
  const missingCount = getMissingCount(input.targetCount, localMatchedCount);

  if (account.protected) {
    throw new ProtectedAccountError(account.username);
  }

  const query = buildOriginalPostsQuery(account);

  if (input.estimateOnly) {
    const countResponse = await client.countPosts({
      query,
      searchMode: input.searchMode,
      untilId: existingScope?.oldestPostId || undefined,
      startTime: input.startTime,
      endTime: input.endTime
    });
    const countEstimate = missingCount === 0 ? localMatchedCount : Math.min(countResponse.totalCount, missingCount);

    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        account,
        requestedCount: input.targetCount,
        requestsCount: userReads + (missingCount === 0 ? 0 : 1),
        estimatedCostUsd: missingCount === 0 ? 0 : finalizeCost(countEstimate, userReads),
        estimateOnly: true,
        writePerformed: false,
        cacheHit: missingCount === 0,
        remoteFetchNeeded: missingCount > 0,
        localMatchedCount,
        missingCount,
        fetchStrategy: missingCount === 0 ? "local-only" : input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(existingScope),
        queryText: query,
        countEstimate,
        filters: buildFilters({
          startTime: input.startTime,
          endTime: input.endTime,
          excludeReplies: true,
          excludeRetweets: true,
          excludeQuotes: true
        })
      })
    };
  }

  if (missingCount === 0) {
    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        account,
        requestedCount: input.targetCount,
        estimatedCostUsd: 0,
        estimateOnly: false,
        writePerformed: false,
        cacheHit: true,
        remoteFetchNeeded: false,
        localMatchedCount,
        missingCount: 0,
        fetchStrategy: "local-only",
        coverageScope: buildCoverageScope(existingScope),
        queryText: query,
        filters: buildFilters({
          startTime: input.startTime,
          endTime: input.endTime,
          excludeReplies: true,
          excludeRetweets: true,
          excludeQuotes: true
        })
      })
    };
  }

  runtime.database.upsertAccount(account);
  const syncRun = runtime.database.startSyncRun({
    accountUserId: account.userId,
    mode: "backfill",
    requestedCount: input.targetCount,
    queryType: "search",
    searchMode: input.searchMode,
    estimateOnly: false,
    queryText: query,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });

  let fetchedCount = 0;
  let newCount = 0;
  let postsConsumed = 0;
  let requestsCount = userReads;
  let nextToken: string | null = null;
  const posts = [];

  try {
    while (fetchedCount < missingCount) {
      const remaining = missingCount - fetchedCount;
      const page = await client.searchPosts({
        query,
        searchMode: input.searchMode,
        maxResults: Math.min(100, remaining),
        nextToken: nextToken || undefined,
        untilId: existingScope?.oldestPostId || undefined,
        startTime: input.startTime,
        endTime: input.endTime
      });

      const boundedPosts = page.posts
        .filter(post => post.authorUserId === account.userId)
        .slice(0, remaining);
      requestsCount += 1;
      postsConsumed += page.posts.length;
      fetchedCount += boundedPosts.length;
      nextToken = page.nextToken;
      posts.push(...boundedPosts);

      if (!nextToken || page.posts.length === 0 || boundedPosts.length < Math.min(page.posts.length, remaining)) {
        break;
      }
    }

    newCount = runtime.database.upsertPosts(posts);
    const currentScope = buildAccountScopeRecord({
      scopeKey,
      accountUserId: account.userId,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      excludeReplies: true,
      excludeRetweets: true,
      excludeQuotes: true,
      newestPostId: existingScope?.newestPostId || posts[0]?.postId || null,
      newestPostAt: existingScope?.newestPostAt || posts[0]?.createdAt || null,
      oldestPostId: posts[posts.length - 1]?.postId || existingScope?.oldestPostId || null,
      oldestPostAt: posts[posts.length - 1]?.createdAt || existingScope?.oldestPostAt || null,
      localPostCount: runtime.database.countPostsForAccountScope({
        accountUserId: account.userId,
        startTime: input.startTime || null,
        endTime: input.endTime || null,
        excludeReplies: true,
        excludeRetweets: true,
        excludeQuotes: true
      }),
      coverageComplete: !nextToken || !input.startTime && !input.endTime
    });
    runtime.database.upsertArchiveScope(currentScope);

    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed, userReads),
      status: "completed"
    });

    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        account,
        requestedCount: input.targetCount,
        fetchedCount,
        newCount,
        requestsCount,
        postsConsumed,
        estimatedCostUsd: finalizeCost(postsConsumed, userReads),
        nextToken,
        estimateOnly: false,
        writePerformed: true,
        cacheHit: false,
        remoteFetchNeeded: true,
        localMatchedCount,
        missingCount,
        fetchStrategy: input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(currentScope),
        queryText: query,
        countEstimate: null,
        filters: buildFilters({
          startTime: input.startTime,
          endTime: input.endTime,
          excludeReplies: true,
          excludeRetweets: true,
          excludeQuotes: true
        })
      })
    };
  } catch (error) {
    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed, userReads),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function syncAccount(input: {
  username?: string;
  userId?: string;
  startTime?: string;
  endTime?: string;
  excludeReplies: boolean;
  excludeRetweets: boolean;
}): Promise<{ sync: IngestSummary }> {
  const runtime = await getRuntime();
  const client = runtime.getXClient();
  const archivedAccount = await resolveArchivedIdentity(input);

  if (!archivedAccount) {
    throw new AccountNotArchivedError();
  }
  if (archivedAccount.protected) {
    throw new ProtectedAccountError(archivedAccount.username);
  }

  const syncState = runtime.database.getSyncState(archivedAccount.userId);
  if (!syncState?.last_synced_post_id) {
    throw new AccountNotArchivedError();
  }
  const scopeKey = buildScopeKey({
    scopeKind: "timeline_latest",
    accountUserId: archivedAccount.userId,
    startTime: null,
    endTime: null,
    excludeReplies: !!input.excludeReplies,
    excludeRetweets: !!input.excludeRetweets,
    excludeQuotes: false
  });
  const existingScope = runtime.database.getArchiveScope(scopeKey);

  const syncRun = runtime.database.startSyncRun({
    accountUserId: archivedAccount.userId,
    mode: "sync",
    requestedCount: null,
    queryType: "timeline",
    searchMode: null,
    estimateOnly: false,
    queryText: null,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });

  let fetchedCount = 0;
  let newCount = 0;
  let postsConsumed = 0;
  let requestsCount = 0;
  let nextToken: string | null = null;
  const collected = [];

  try {
    while (true) {
      const page = await client.getTimeline({
        account: archivedAccount,
        maxResults: 100,
        nextToken: nextToken || undefined,
        sinceId: String(syncState.last_synced_post_id),
        startTime: input.startTime,
        endTime: input.endTime,
        excludeReplies: input.excludeReplies,
        excludeRetweets: input.excludeRetweets
      });

      requestsCount += 1;
      postsConsumed += page.posts.length;
      fetchedCount += page.posts.length;
      collected.push(...page.posts);
      nextToken = page.nextToken;

      if (!nextToken || page.posts.length === 0) {
        break;
      }
    }

    newCount = runtime.database.upsertPosts(collected);
    const newestPost = collected[0] || null;
    const currentScope = buildAccountScopeRecord({
      scopeKey,
      accountUserId: archivedAccount.userId,
      scopeKind: "timeline_latest",
      startTime: null,
      endTime: null,
      excludeReplies: input.excludeReplies,
      excludeRetweets: input.excludeRetweets,
      excludeQuotes: false,
      newestPostId: newestPost?.postId || existingScope?.newestPostId || String(syncState.last_synced_post_id),
      newestPostAt: newestPost?.createdAt || existingScope?.newestPostAt || (syncState.last_synced_post_at ? String(syncState.last_synced_post_at) : null),
      oldestPostId: existingScope?.oldestPostId || null,
      oldestPostAt: existingScope?.oldestPostAt || null,
      localPostCount: runtime.database.countPostsForAccountScope({
        accountUserId: archivedAccount.userId,
        excludeReplies: input.excludeReplies,
        excludeRetweets: input.excludeRetweets,
        excludeQuotes: false
      }),
      coverageComplete: true
    });
    runtime.database.upsertArchiveScope(currentScope);

    runtime.database.updateSyncState({
      accountUserId: archivedAccount.userId,
      lastSyncedPostId: newestPost?.postId || String(syncState.last_synced_post_id),
      lastSyncedPostAt: newestPost?.createdAt || (syncState.last_synced_post_at ? String(syncState.last_synced_post_at) : null),
      mode: "sync"
    });

    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed),
      status: "completed"
    });

    return {
      sync: buildIngestSummary({
        mode: "sync",
        queryType: "timeline",
        searchMode: null,
        account: archivedAccount,
        requestedCount: null,
        fetchedCount,
        newCount,
        requestsCount,
        postsConsumed,
        estimatedCostUsd: finalizeCost(postsConsumed),
        nextToken,
        estimateOnly: false,
        writePerformed: true,
        cacheHit: false,
        remoteFetchNeeded: true,
        localMatchedCount: existingScope?.localPostCount || 0,
        missingCount: 0,
        fetchStrategy: "poll-newer",
        coverageScope: buildCoverageScope(currentScope),
        filters: buildFilters(input)
      })
    };
  } catch (error) {
    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function backfillSearch(input: {
  query: string;
  searchMode: "recent" | "full_archive";
  targetCount: number;
  startTime?: string;
  endTime?: string;
  estimateOnly: boolean;
}): Promise<{ sync: IngestSummary }> {
  const runtime = await getRuntime();
  const client = runtime.getXClient();
  const scopeKind: ArchiveScopeKind = input.startTime || input.endTime ? "search_window" : "search_latest";
  const scopeKey = buildScopeKey({
    scopeKind,
    queryText: input.query,
    searchMode: input.searchMode,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });
  const existingScope = runtime.database.getArchiveScope(scopeKey) || (() => {
    const stats = runtime.database.getQueryScopeStats({
      queryText: input.query,
      startTime: input.startTime || null,
      endTime: input.endTime || null
    });

    if (stats.totalCount === 0) {
      return null;
    }

    return buildSearchScopeRecord({
      scopeKey,
      queryText: input.query,
      searchMode: input.searchMode,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      newestPostId: stats.newestPostId,
      newestPostAt: stats.newestPostAt,
      oldestPostId: stats.oldestPostId,
      oldestPostAt: stats.oldestPostAt,
      localPostCount: stats.totalCount,
      coverageComplete: true
    });
  })();
  const localMatchedCount = existingScope?.localPostCount || 0;
  const missingCount = getMissingCount(input.targetCount, localMatchedCount);

  if (input.estimateOnly) {
    const countEstimate = missingCount === 0
      ? localMatchedCount
      : Math.min((await client.countPosts({
        query: input.query,
        searchMode: input.searchMode,
        untilId: existingScope?.oldestPostId || undefined,
        startTime: input.startTime,
        endTime: input.endTime
      })).totalCount, missingCount);

    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        requestedCount: input.targetCount,
        requestsCount: missingCount === 0 ? 0 : 1,
        estimatedCostUsd: missingCount === 0 ? 0 : finalizeCost(countEstimate),
        estimateOnly: true,
        writePerformed: false,
        cacheHit: missingCount === 0,
        remoteFetchNeeded: missingCount > 0,
        localMatchedCount,
        missingCount,
        fetchStrategy: missingCount === 0 ? "local-only" : input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(existingScope),
        queryText: input.query,
        countEstimate,
        filters: buildFilters(input)
      })
    };
  }

  if (missingCount === 0) {
    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        requestedCount: input.targetCount,
        estimatedCostUsd: 0,
        estimateOnly: false,
        writePerformed: false,
        cacheHit: true,
        remoteFetchNeeded: false,
        localMatchedCount,
        missingCount: 0,
        fetchStrategy: "local-only",
        coverageScope: buildCoverageScope(existingScope),
        queryText: input.query,
        filters: buildFilters(input)
      })
    };
  }

  const syncRun = runtime.database.startSyncRun({
    accountUserId: null,
    mode: "backfill",
    requestedCount: input.targetCount,
    queryType: "search",
    searchMode: input.searchMode,
    estimateOnly: false,
    queryText: input.query,
    startTime: input.startTime || null,
    endTime: input.endTime || null
  });

  let fetchedCount = 0;
  let newCount = 0;
  let postsConsumed = 0;
  let requestsCount = 0;
  let nextToken: string | null = null;
  const accounts = new Map<string, AccountRecord>();
  const posts = [];

  try {
    while (fetchedCount < missingCount) {
      const remaining = missingCount - fetchedCount;
      const page = await client.searchPosts({
        query: input.query,
        searchMode: input.searchMode,
        maxResults: Math.min(100, remaining),
        nextToken: nextToken || undefined,
        untilId: existingScope?.oldestPostId || undefined,
        startTime: input.startTime,
        endTime: input.endTime
      });

      const boundedPosts = page.posts.slice(0, remaining);
      requestsCount += 1;
      postsConsumed += page.posts.length;
      fetchedCount += boundedPosts.length;
      nextToken = page.nextToken;

      for (const account of page.accounts) {
        accounts.set(account.userId, account);
      }
      posts.push(...boundedPosts);

      if (!nextToken || page.posts.length === 0 || boundedPosts.length < page.posts.length) {
        break;
      }
    }

    for (const account of accounts.values()) {
      runtime.database.upsertAccount(account);
    }
    newCount = runtime.database.upsertPosts(posts);
    const currentScope = buildSearchScopeRecord({
      scopeKey,
      queryText: input.query,
      searchMode: input.searchMode,
      scopeKind,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      newestPostId: existingScope?.newestPostId || posts[0]?.postId || null,
      newestPostAt: existingScope?.newestPostAt || posts[0]?.createdAt || null,
      oldestPostId: posts[posts.length - 1]?.postId || existingScope?.oldestPostId || null,
      oldestPostAt: posts[posts.length - 1]?.createdAt || existingScope?.oldestPostAt || null,
      localPostCount: runtime.database.countPostsForQueryScope({
        queryText: input.query,
        startTime: input.startTime || null,
        endTime: input.endTime || null
      }),
      coverageComplete: !nextToken || !input.startTime && !input.endTime
    });
    runtime.database.upsertArchiveScope(currentScope);

    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed),
      status: "completed"
    });

    return {
      sync: buildIngestSummary({
        mode: "backfill",
        queryType: "search",
        searchMode: input.searchMode,
        requestedCount: input.targetCount,
        fetchedCount,
        newCount,
        requestsCount,
        postsConsumed,
        estimatedCostUsd: finalizeCost(postsConsumed),
        nextToken,
        estimateOnly: false,
        writePerformed: true,
        cacheHit: false,
        remoteFetchNeeded: true,
        localMatchedCount,
        missingCount,
        fetchStrategy: input.startTime || input.endTime ? "remote-window" : "extend-older",
        coverageScope: buildCoverageScope(currentScope),
        queryText: input.query,
        countEstimate: null,
        filters: buildFilters(input)
      })
    };
  } catch (error) {
    runtime.database.finishSyncRun({
      syncRunId: syncRun.id,
      fetchedCount,
      newCount,
      requestsCount,
      postsConsumed,
      estimatedCostUsd: finalizeCost(postsConsumed),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

const builtInExecutors: Record<string, (input: ToolInput) => Promise<unknown>> = {
  "sources.accounts.resolve": async input => {
    const account = await resolveRemoteIdentity(input);
    return {
      account,
      meta: {
        requestsCount: 1,
        userReads: 1,
        estimatedCostUsd: finalizeCost(0, 1)
      }
    };
  },
  "ingest.accounts.backfill": async input => backfillAccount(input as never),
  "ingest.accounts.original_backfill": async input => backfillOriginalAccount(input as never),
  "ingest.accounts.sync": async input => syncAccount(input as never),
  "ingest.search.backfill": async input => backfillSearch(input as never),
  "archive.posts.list": async input => {
    const runtime = await getRuntime();
    const archivedAccount = await resolveArchivedIdentity(input);
    if ((input.username || input.userId) && !archivedAccount) {
      throw new AccountNotFoundError("Archived account not found.");
    }
    return {
      posts: runtime.database.listPosts({
        accountUserId: archivedAccount?.userId,
        startTime: typeof input.startTime === "string" ? input.startTime : undefined,
        endTime: typeof input.endTime === "string" ? input.endTime : undefined,
        limit: Number(input.limit)
      })
    };
  },
  "archive.posts.search": async input => {
    const runtime = await getRuntime();
    const archivedAccount = await resolveArchivedIdentity(input);
    if ((input.username || input.userId) && !archivedAccount) {
      throw new AccountNotFoundError("Archived account not found.");
    }
    return {
      posts: runtime.database.searchPosts({
        query: String(input.query),
        accountUserId: archivedAccount?.userId,
        startTime: typeof input.startTime === "string" ? input.startTime : undefined,
        endTime: typeof input.endTime === "string" ? input.endTime : undefined,
        limit: Number(input.limit)
      })
    };
  },
  "archive.accounts.list": async input => {
    const runtime = await getRuntime();
    return {
      accounts: runtime.database.listAccounts(Number(input.limit))
    };
  },
  "archive.accounts.get": async input => {
    const runtime = await getRuntime();
    const archivedAccount = await resolveArchivedIdentity(input);
    if (!archivedAccount) {
      throw new AccountNotFoundError("Archived account not found.");
    }
    const scopes = runtime.database
      .listArchiveScopesForAccount(archivedAccount.userId)
      .map(buildScopeOverview);
    return {
      account: runtime.database.getArchivedAccount(archivedAccount.userId),
      coverage: {
        defaultBackfillTool: "ingest.accounts.original_backfill",
        defaultBehavior: "Use original posts by default unless the user explicitly asks for replies, retweets, quote tweets, or the full timeline.",
        scopes
      }
    };
  },
  "archive.billing.summary": async input => {
    const runtime = await getRuntime();
    return {
      billing: runtime.database.getBillingSummary({
        recentRunsLimit: Number(input.recentRunsLimit),
        accountLimit: Number(input.accountLimit)
      })
    };
  },
  "analysis.labels.list": async () => {
    return {
      version: ANALYSIS_VERSION,
      labels: analysisLabels
    };
  },
  "analysis.posts.run": async input => {
    const runtime = await getRuntime();
    const archivedAccount = (input.username || input.userId) ? await resolveArchivedIdentity(input) : null;

    if ((input.username || input.userId) && !archivedAccount) {
      throw new AccountNotArchivedError();
    }

    const posts = runtime.database.listPostsForAnalysis({
      accountUserId: archivedAccount?.userId,
      limit: Number(input.limit),
      onlyUnanalyzed: Boolean(input.onlyUnanalyzed),
      reanalyzeAll: Boolean(input.reanalyzeAll)
    });

    const analysisEngine = await runtime.getAnalysisEngine();
    const insights = await analysisEngine.analyzePosts(posts);
    runtime.database.upsertPostInsights(insights);

    const summary = runtime.database.getInsightsSummary({
      accountUserId: archivedAccount?.userId,
      topLabelsLimit: 10
    });

    return {
      account: archivedAccount,
      analysis: {
        processedCount: posts.length,
        completedCount: insights.length,
        failedCount: 0,
        skippedCount: 0,
        remainingPendingCount: summary.pendingPosts,
        analysisVersion: ANALYSIS_VERSION
      },
      summary: {
        ...summary,
        topLabels: summary.topLabels.map(label => ({
          ...label,
          titleTr: getLabelTitle(label.label)
        }))
      }
    };
  },
  "archive.posts.semantic_search": async input => {
    const runtime = await getRuntime();
    const archivedAccount = (input.username || input.userId) ? await resolveArchivedIdentity(input) : null;
    if ((input.username || input.userId) && !archivedAccount) {
      throw new AccountNotFoundError("Archived account not found.");
    }

    const summary = runtime.database.getInsightsSummary({
      accountUserId: archivedAccount?.userId,
      topLabelsLimit: 10
    });

    if (summary.analyzedPosts === 0) {
      return {
        query: String(input.query),
        results: [],
        warning: "Arsivde analiz edilmis post yok. Istersen once analysis.posts.run ile bu araligi etiketleyebilirim.",
        analyzedPosts: 0
      };
    }

    const candidates = runtime.database.listSemanticCandidates({
      accountUserId: archivedAccount?.userId,
      startTime: typeof input.startTime === "string" ? input.startTime : undefined,
      endTime: typeof input.endTime === "string" ? input.endTime : undefined,
      educationalOnly: Boolean(input.educationalOnly)
    });
    const analysisEngine = await runtime.getAnalysisEngine();
    const results = await analysisEngine.semanticSearch(String(input.query), candidates, {
      labels: Array.isArray(input.labels) ? input.labels.map(value => String(value)) : [],
      educationalOnly: Boolean(input.educationalOnly),
      limit: Number(input.limit)
    });

    return {
      query: String(input.query),
      results: results.map(result => ({
        ...result,
        labelTitles: result.matchedLabels.map(getLabelTitle)
      })),
      analyzedPosts: summary.analyzedPosts
    };
  },
  "archive.insights.summary": async input => {
    const runtime = await getRuntime();
    const archivedAccount = (input.username || input.userId) ? await resolveArchivedIdentity(input) : null;
    if ((input.username || input.userId) && !archivedAccount) {
      throw new AccountNotFoundError("Archived account not found.");
    }

    const summary = runtime.database.getInsightsSummary({
      accountUserId: archivedAccount?.userId,
      topLabelsLimit: Number(input.topLabelsLimit)
    });

    return {
      account: archivedAccount,
      insights: {
        ...summary,
        topLabels: summary.topLabels.map(label => ({
          ...label,
          titleTr: getLabelTitle(label.label)
        })),
        analysisAvailable: summary.analyzedPosts > 0,
        analysisVersion: summary.analysisVersion || ANALYSIS_VERSION
      }
    };
  }
};

export async function executeRegisteredTool(
  name: string,
  input: ToolInput,
  registry: readonly ToolDefinition[] = toolRegistry
) {
  const tool = getToolDefinition(name, registry);

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const parsedInput = await tool.inputSchema.parseAsync(input ?? {});
  const executor = builtInExecutors[name];

  if (!executor) {
    throw new Error(`Executor not found for tool: ${name}`);
  }

  return executor(parsedInput as ToolInput) as Promise<Record<string, unknown>>;
}
