import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { executeRegisteredTool } from "../src/tool-executors.js";
import { shutdownRuntime } from "../src/runtime.js";
import { XClient } from "../src/x-client.js";
import type { AccountRecord, PostRecord } from "../src/provider-types.js";
import { createTempDir, writeJson } from "./helpers.js";

function buildAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    userId: "u1",
    username: "sampleauthor",
    displayName: "Sample Author",
    description: "Yazilim notlari",
    protected: false,
    verified: false,
    profileImageUrl: null,
    followerCount: 100,
    followingCount: 50,
    postCount: 2000,
    raw: { id: "u1" },
    ...overrides
  };
}

function buildPost(id: string, text: string, createdAt: string, overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    postId: id,
    authorUserId: "u1",
    username: "sampleauthor",
    textRaw: text,
    textNormalized: text,
    mediaUrls: [],
    createdAt,
    lang: "tr",
    conversationId: id,
    replyCount: 0,
    likeCount: 0,
    repostCount: 0,
    quoteCount: 0,
    bookmarkCount: 0,
    isReply: false,
    isRepost: false,
    isQuote: false,
    source: "web",
    ingestSource: "timeline",
    matchedQuery: null,
    raw: { id, text },
    ingestedAt: "2026-03-08T10:00:00.000Z",
    ...overrides
  };
}

test("timeline backfill, estimate, search ingest and sync work together", async () => {
  const tempDir = createTempDir("x-archive-integration-");
  const credentialsPath = path.join(tempDir, "x.json");
  const dbPath = path.join(tempDir, "archive.sqlite");

  writeJson(credentialsPath, {
    authMode: "bearer_token",
    bearerToken: "token"
  });

  process.env.X_CREDENTIALS_FILE = credentialsPath;
  process.env.X_ARCHIVE_DB_PATH = dbPath;

  const originalProbe = XClient.prototype.probe;
  const originalGetUserByUsername = XClient.prototype.getUserByUsername;
  const originalGetUserById = XClient.prototype.getUserById;
  const originalGetTimeline = XClient.prototype.getTimeline;
  const originalSearchPosts = XClient.prototype.searchPosts;
  const originalCountPosts = XClient.prototype.countPosts;

  XClient.prototype.probe = async function probe() {};
  XClient.prototype.getUserByUsername = async function getUserByUsername(username: string) {
    if (username === "sampleauthor") {
      return buildAccount();
    }
    throw new Error(`Unexpected username: ${username}`);
  };
  XClient.prototype.getUserById = async function getUserById(userId: string) {
    if (userId === "u1") {
      return buildAccount();
    }
    throw new Error(`Unexpected userId: ${userId}`);
  };
  XClient.prototype.getTimeline = async function getTimeline(input) {
    if (input.sinceId === "p3") {
      return {
        posts: [
          buildPost("p4", "yeni not: testing ihmal edilmez", "2026-03-04T10:00:00.000Z")
        ],
        nextToken: null,
        resultCount: 1
      };
    }

    if (input.nextToken === "page2") {
      return {
        posts: [
          buildPost("p1", "vibe codingde mimariyi erken buyutme", "2026-03-01T10:00:00.000Z")
        ],
        nextToken: null,
        resultCount: 1
      };
    }

    return {
      posts: [
        buildPost("p3", "microservices her zaman gerekmez", "2026-03-03T10:00:00.000Z"),
        buildPost("p2", "monolith cogu proje icin daha saglikli", "2026-03-02T10:00:00.000Z")
      ],
      nextToken: "page2",
      resultCount: 2
    };
  };
  XClient.prototype.searchPosts = async function searchPosts(input) {
    if (input.query === "(from:sampleauthor) -is:reply -is:retweet -is:quote") {
      return {
        accounts: [
          buildAccount()
        ],
        posts: [
          buildPost("o1", "sadece ozgun post", "2026-03-07T10:00:00.000Z", {
            ingestSource: "search",
            matchedQuery: input.query,
            mediaUrls: ["https://pbs.twimg.com/media/photo1.jpg"]
          })
        ],
        nextToken: null,
        resultCount: 1
      };
    }

    return {
      accounts: [
        buildAccount(),
        buildAccount({
          userId: "u2",
          username: "mimarhoca",
          displayName: "Mimar Hoca",
          raw: { id: "u2" }
        })
      ],
      posts: [
        buildPost("s1", "monolith bazen daha dogrudur", "2026-03-05T10:00:00.000Z", {
          ingestSource: "search",
          matchedQuery: input.query
        }),
        buildPost("s2", "microservices icin erken davranma", "2026-03-06T10:00:00.000Z", {
          postId: "s2",
          authorUserId: "u2",
          username: "mimarhoca",
          ingestSource: "search",
          matchedQuery: input.query,
          raw: { id: "s2", text: "microservices icin erken davranma" }
        })
      ],
      nextToken: null,
      resultCount: 2
    };
  };
  XClient.prototype.countPosts = async function countPosts() {
    if (arguments[0]?.query === "(from:sampleauthor) -is:reply -is:retweet -is:quote") {
      return {
        totalCount: 12
      };
    }

    return {
      totalCount: 42
    };
  };

  try {
    await shutdownRuntime();

    const backfillEstimate = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 3,
      excludeReplies: false,
      excludeRetweets: false,
      estimateOnly: true
    });

    const backfill = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 3,
      excludeReplies: false,
      excludeRetweets: false
    });

    const searchEstimate = await executeRegisteredTool("ingest.search.backfill", {
      query: "(from:sampleauthor) (monolith OR microservices)",
      searchMode: "recent",
      targetCount: 10,
      estimateOnly: true
    });

    const searchBackfill = await executeRegisteredTool("ingest.search.backfill", {
      query: "(from:sampleauthor) (monolith OR microservices)",
      searchMode: "recent",
      targetCount: 10
    });

    const originalEstimate = await executeRegisteredTool("ingest.accounts.original_backfill", {
      username: "sampleauthor",
      searchMode: "recent",
      targetCount: 10,
      estimateOnly: true
    });

    const originalBackfill = await executeRegisteredTool("ingest.accounts.original_backfill", {
      username: "sampleauthor",
      searchMode: "recent",
      targetCount: 10
    });

    const listed = await executeRegisteredTool("archive.posts.list", {
      username: "sampleauthor",
      limit: 10
    });

    const searched = await executeRegisteredTool("archive.posts.search", {
      query: "microservices",
      limit: 10
    });

    const synced = await executeRegisteredTool("ingest.accounts.sync", {
      username: "sampleauthor",
      excludeReplies: false,
      excludeRetweets: false
    });

    const account = await executeRegisteredTool("archive.accounts.get", {
      username: "sampleauthor"
    });
    const billing = await executeRegisteredTool("archive.billing.summary", {
      recentRunsLimit: 10,
      accountLimit: 10
    });

    assert.equal((backfillEstimate as { sync: { estimateOnly: boolean; writePerformed: boolean; countEstimate: number } }).sync.estimateOnly, true);
    assert.equal((backfillEstimate as { sync: { writePerformed: boolean } }).sync.writePerformed, false);
    assert.equal((backfillEstimate as { sync: { countEstimate: number } }).sync.countEstimate, 3);

    assert.equal((backfill as { sync: { fetchedCount: number; newCount: number } }).sync.fetchedCount, 3);
    assert.equal((backfill as { sync: { newCount: number } }).sync.newCount, 3);

    assert.equal((searchEstimate as { sync: { estimateOnly: boolean; countEstimate: number } }).sync.estimateOnly, true);
    assert.equal((searchEstimate as { sync: { countEstimate: number } }).sync.countEstimate, 10);

    assert.equal((searchBackfill as { sync: { fetchedCount: number; newCount: number; queryType: string } }).sync.fetchedCount, 2);
    assert.equal((searchBackfill as { sync: { newCount: number } }).sync.newCount, 2);
    assert.equal((searchBackfill as { sync: { queryType: string } }).sync.queryType, "search");

    assert.equal((originalEstimate as { sync: { estimateOnly: boolean; countEstimate: number; filters: { excludeQuotes: boolean } } }).sync.estimateOnly, true);
    assert.equal((originalEstimate as { sync: { countEstimate: number; missingCount: number; localMatchedCount: number } }).sync.countEstimate, 6);
    assert.equal((originalEstimate as { sync: { missingCount: number } }).sync.missingCount, 6);
    assert.equal((originalEstimate as { sync: { localMatchedCount: number } }).sync.localMatchedCount, 4);
    assert.equal((originalEstimate as { sync: { filters: { excludeQuotes: boolean } } }).sync.filters.excludeQuotes, true);

    assert.equal((originalBackfill as { sync: { fetchedCount: number; newCount: number; queryText: string } }).sync.fetchedCount, 1);
    assert.equal((originalBackfill as { sync: { newCount: number } }).sync.newCount, 1);
    assert.equal((originalBackfill as { sync: { queryText: string } }).sync.queryText, "(from:sampleauthor) -is:reply -is:retweet -is:quote");

    assert.equal((listed as { posts: unknown[] }).posts.length, 5);
    assert.deepEqual((listed as { posts: Array<{ mediaUrls: string[] }> }).posts.find(post => post.mediaUrls.length > 0)?.mediaUrls, ["https://pbs.twimg.com/media/photo1.jpg"]);
    assert.equal((searched as { posts: Array<{ matchedQuery: string | null; ingestSource: string }> }).posts.length >= 2, true);
    assert.equal((searched as { posts: Array<{ matchedQuery: string | null; ingestSource: string }> }).posts[0]?.ingestSource, "search");

    assert.equal((synced as { sync: { newCount: number } }).sync.newCount, 1);
    assert.equal((account as { account: { totalPosts: number } }).account.totalPosts, 6);
    assert.equal((account as {
      coverage: {
        defaultBackfillTool: string;
        scopes: Array<{ contentType: string; requestMode: string }>;
      };
    }).coverage.defaultBackfillTool, "ingest.accounts.original_backfill");
    assert.equal((account as {
      coverage: {
        scopes: Array<{ contentType: string; requestMode: string }>;
      };
    }).coverage.scopes.some(scope => scope.contentType === "original_posts"), true);
    assert.equal((account as {
      coverage: {
        scopes: Array<{ contentType: string; requestMode: string }>;
      };
    }).coverage.scopes.some(scope => scope.contentType === "all_posts"), true);
    assert.equal((billing as {
      billing: {
        totalRuns: number;
        successfulWriteRuns: number;
        totalPostsConsumed: number;
        recentRuns: Array<{ estimatedCostUsd: number }>;
        accounts: Array<{ username: string | null; estimatedCostUsd: number }>;
      };
    }).billing.totalRuns >= 4, true);
    assert.equal((billing as {
      billing: {
        successfulWriteRuns: number;
      };
    }).billing.successfulWriteRuns >= 4, true);
    assert.equal((billing as {
      billing: {
        totalPostsConsumed: number;
      };
    }).billing.totalPostsConsumed >= 6, true);
    assert.equal((billing as {
      billing: {
        recentRuns: Array<{ estimatedCostUsd: number }>;
      };
    }).billing.recentRuns.length > 0, true);
    assert.equal((billing as {
      billing: {
        accounts: Array<{ username: string | null; estimatedCostUsd: number }>;
      };
    }).billing.accounts.some(accountItem => accountItem.username === "sampleauthor"), true);
  } finally {
    XClient.prototype.probe = originalProbe;
    XClient.prototype.getUserByUsername = originalGetUserByUsername;
    XClient.prototype.getUserById = originalGetUserById;
    XClient.prototype.getTimeline = originalGetTimeline;
    XClient.prototype.searchPosts = originalSearchPosts;
    XClient.prototype.countPosts = originalCountPosts;
    await shutdownRuntime();
    delete process.env.X_CREDENTIALS_FILE;
    delete process.env.X_ARCHIVE_DB_PATH;
  }
});

test("smart backfill reuses exact coverage and avoids re-fetching cached ranges", async () => {
  const tempDir = createTempDir("x-archive-smart-");
  const credentialsPath = path.join(tempDir, "x.json");
  const dbPath = path.join(tempDir, "archive.sqlite");

  writeJson(credentialsPath, {
    authMode: "bearer_token",
    bearerToken: "token"
  });

  process.env.X_CREDENTIALS_FILE = credentialsPath;
  process.env.X_ARCHIVE_DB_PATH = dbPath;

  const originalProbe = XClient.prototype.probe;
  const originalGetUserByUsername = XClient.prototype.getUserByUsername;
  const originalGetTimeline = XClient.prototype.getTimeline;

  const timelineCalls: Array<Record<string, unknown>> = [];

  XClient.prototype.probe = async function probe() {};
  XClient.prototype.getUserByUsername = async function getUserByUsername() {
    return buildAccount();
  };
  XClient.prototype.getTimeline = async function getTimeline(input) {
    timelineCalls.push({
      untilId: input.untilId || null,
      startTime: input.startTime || null,
      endTime: input.endTime || null
    });

    if (input.startTime) {
      return {
        posts: [
          buildPost("w2", "ocak ikinci", "2024-01-20T10:00:00.000Z"),
          buildPost("w1", "ocak birinci", "2024-01-10T10:00:00.000Z")
        ],
        nextToken: null,
        resultCount: 2
      };
    }

    if (input.untilId === "p1") {
      return {
        posts: [
          buildPost("p0", "daha eski bir post", "2026-02-29T10:00:00.000Z")
        ],
        nextToken: null,
        resultCount: 1
      };
    }

    return {
      posts: [
        buildPost("p2", "en yeni post", "2026-03-02T10:00:00.000Z"),
        buildPost("p1", "ikinci yeni post", "2026-03-01T10:00:00.000Z")
      ],
      nextToken: "older-page",
      resultCount: 2
    };
  };

  try {
    await shutdownRuntime();

    const latestTwo = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 2,
      excludeReplies: false,
      excludeRetweets: false
    });

    const latestTwoAgain = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 2,
      excludeReplies: false,
      excludeRetweets: false
    });

    const latestThree = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 3,
      excludeReplies: false,
      excludeRetweets: false
    });

    const windowBackfill = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 2,
      startTime: "2024-01-01T00:00:00.000Z",
      endTime: "2024-01-31T23:59:59.000Z",
      excludeReplies: false,
      excludeRetweets: false
    });

    const latestTwoAfterWindow = await executeRegisteredTool("ingest.accounts.backfill", {
      username: "sampleauthor",
      targetCount: 2,
      excludeReplies: false,
      excludeRetweets: false
    });

    assert.equal((latestTwo as { sync: { fetchedCount: number; cacheHit: boolean; localMatchedCount: number; missingCount: number; fetchStrategy: string } }).sync.fetchedCount, 2);
    assert.equal((latestTwo as { sync: { cacheHit: boolean } }).sync.cacheHit, false);
    assert.equal((latestTwoAgain as { sync: { cacheHit: boolean; remoteFetchNeeded: boolean; estimatedCostUsd: number } }).sync.cacheHit, true);
    assert.equal((latestTwoAgain as { sync: { remoteFetchNeeded: boolean } }).sync.remoteFetchNeeded, false);
    assert.equal((latestTwoAgain as { sync: { estimatedCostUsd: number } }).sync.estimatedCostUsd, 0);

    assert.equal((latestThree as { sync: { fetchedCount: number; localMatchedCount: number; missingCount: number; fetchStrategy: string } }).sync.fetchedCount, 1);
    assert.equal((latestThree as { sync: { localMatchedCount: number } }).sync.localMatchedCount, 2);
    assert.equal((latestThree as { sync: { missingCount: number } }).sync.missingCount, 1);
    assert.equal((latestThree as { sync: { fetchStrategy: string } }).sync.fetchStrategy, "extend-older");

    assert.equal((windowBackfill as { sync: { fetchedCount: number; fetchStrategy: string } }).sync.fetchedCount, 2);
    assert.equal((windowBackfill as { sync: { fetchStrategy: string } }).sync.fetchStrategy, "remote-window");

    assert.equal((latestTwoAfterWindow as { sync: { cacheHit: boolean; remoteFetchNeeded: boolean } }).sync.cacheHit, true);
    assert.equal((latestTwoAfterWindow as { sync: { remoteFetchNeeded: boolean } }).sync.remoteFetchNeeded, false);

    assert.deepEqual(timelineCalls, [
      { untilId: null, startTime: null, endTime: null },
      { untilId: "p1", startTime: null, endTime: null },
      { untilId: null, startTime: "2024-01-01T00:00:00.000Z", endTime: "2024-01-31T23:59:59.000Z" }
    ]);
  } finally {
    XClient.prototype.probe = originalProbe;
    XClient.prototype.getUserByUsername = originalGetUserByUsername;
    XClient.prototype.getTimeline = originalGetTimeline;
    await shutdownRuntime();
    delete process.env.X_CREDENTIALS_FILE;
    delete process.env.X_ARCHIVE_DB_PATH;
  }
});
