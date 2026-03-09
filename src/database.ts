import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AccountRecord,
  AnalysisStatus,
  ArchiveScopeRecord,
  ArchivedAccountRecord,
  InsightsSummary,
  PostInsightRecord,
  BillingAccountRecord,
  BillingRunRecord,
  BillingSummary,
  PostRecord
} from "./provider-types.js";

export interface SyncRunResult {
  id: number;
  accountUserId: string | null;
  mode: "backfill" | "sync";
}

interface ListPostsParams {
  accountUserId?: string;
  startTime?: string;
  endTime?: string;
  limit: number;
}

interface SearchPostsParams extends ListPostsParams {
  query: string;
}

interface ListPostsForAnalysisParams {
  accountUserId?: string;
  limit: number;
  onlyUnanalyzed: boolean;
  reanalyzeAll: boolean;
}

interface ListSemanticCandidatesParams {
  accountUserId?: string;
  startTime?: string;
  endTime?: string;
  educationalOnly: boolean;
}

export class ArchiveDatabase {
  private db: DatabaseSync;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA foreign_keys=ON;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT,
        description TEXT,
        protected INTEGER NOT NULL DEFAULT 0,
        verified INTEGER NOT NULL DEFAULT 0,
        profile_image_url TEXT,
        follower_count INTEGER,
        following_count INTEGER,
        post_count INTEGER,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS posts (
        post_id TEXT PRIMARY KEY,
        author_user_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
        text_raw TEXT NOT NULL,
        text_normalized TEXT NOT NULL,
        media_urls TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        lang TEXT,
        conversation_id TEXT,
        reply_count INTEGER,
        like_count INTEGER,
        repost_count INTEGER,
        quote_count INTEGER,
        bookmark_count INTEGER,
        is_reply INTEGER NOT NULL DEFAULT 0,
        is_repost INTEGER NOT NULL DEFAULT 0,
        is_quote INTEGER NOT NULL DEFAULT 0,
        source TEXT,
        ingest_source TEXT NOT NULL DEFAULT 'timeline',
        matched_query TEXT,
        raw_json TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_user_id TEXT REFERENCES accounts(user_id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        requested_count INTEGER,
        fetched_count INTEGER NOT NULL DEFAULT 0,
        new_count INTEGER NOT NULL DEFAULT 0,
        query_type TEXT NOT NULL DEFAULT 'timeline',
        search_mode TEXT,
        estimate_only INTEGER NOT NULL DEFAULT 0,
        requests_count INTEGER NOT NULL DEFAULT 0,
        posts_consumed INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        query_text TEXT,
        start_time TEXT,
        end_time TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS account_sync_state (
        account_user_id TEXT PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
        last_synced_post_id TEXT,
        last_synced_post_at TEXT,
        last_backfill_at TEXT,
        last_sync_at TEXT
      );

      CREATE TABLE IF NOT EXISTS archive_scopes (
        scope_key TEXT PRIMARY KEY,
        account_user_id TEXT REFERENCES accounts(user_id) ON DELETE CASCADE,
        scope_kind TEXT NOT NULL,
        query_text TEXT,
        search_mode TEXT,
        start_time TEXT,
        end_time TEXT,
        exclude_replies INTEGER NOT NULL DEFAULT 0,
        exclude_retweets INTEGER NOT NULL DEFAULT 0,
        exclude_quotes INTEGER NOT NULL DEFAULT 0,
        newest_post_id TEXT,
        newest_post_at TEXT,
        oldest_post_id TEXT,
        oldest_post_at TEXT,
        local_post_count INTEGER NOT NULL DEFAULT 0,
        coverage_complete INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS post_insights (
        post_id TEXT PRIMARY KEY REFERENCES posts(post_id) ON DELETE CASCADE,
        analysis_status TEXT NOT NULL,
        analysis_version TEXT NOT NULL,
        embedding_vector TEXT,
        is_educational_score REAL,
        is_educational INTEGER,
        topic_scores_json TEXT,
        matched_labels_json TEXT,
        signal_flags_json TEXT,
        analyzed_at TEXT,
        error_message TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        post_id UNINDEXED,
        author_user_id UNINDEXED,
        username UNINDEXED,
        text_normalized
      );

      CREATE INDEX IF NOT EXISTS idx_posts_author_created_at ON posts(author_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);
      CREATE INDEX IF NOT EXISTS idx_archive_scopes_account_kind ON archive_scopes(account_user_id, scope_kind);
      CREATE INDEX IF NOT EXISTS idx_post_insights_status ON post_insights(analysis_status, analysis_version);
    `);

    this.ensureColumn("posts", "ingest_source", "TEXT NOT NULL DEFAULT 'timeline'");
    this.ensureColumn("posts", "matched_query", "TEXT");
    this.ensureColumn("posts", "media_urls", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("post_insights", "analysis_version", "TEXT NOT NULL DEFAULT '2026-03-09-v1'");
    this.ensureColumn("sync_runs", "query_type", "TEXT NOT NULL DEFAULT 'timeline'");
    this.ensureColumn("sync_runs", "search_mode", "TEXT");
    this.ensureColumn("sync_runs", "estimate_only", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("sync_runs", "requests_count", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("sync_runs", "posts_consumed", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("sync_runs", "estimated_cost_usd", "REAL NOT NULL DEFAULT 0");
    this.ensureColumn("sync_runs", "query_text", "TEXT");
    this.ensureNullableSyncRunAccountUserId();
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!rows.some(row => row.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private ensureNullableSyncRunAccountUserId() {
    const rows = this.db.prepare(`PRAGMA table_info(sync_runs)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    const accountUserIdColumn = rows.find(row => row.name === "account_user_id");
    if (!accountUserIdColumn || accountUserIdColumn.notnull === 0) {
      return;
    }

    this.db.exec(`
      CREATE TABLE sync_runs_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_user_id TEXT REFERENCES accounts(user_id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        requested_count INTEGER,
        fetched_count INTEGER NOT NULL DEFAULT 0,
        new_count INTEGER NOT NULL DEFAULT 0,
        query_type TEXT NOT NULL DEFAULT 'timeline',
        search_mode TEXT,
        estimate_only INTEGER NOT NULL DEFAULT 0,
        requests_count INTEGER NOT NULL DEFAULT 0,
        posts_consumed INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        query_text TEXT,
        start_time TEXT,
        end_time TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );

      INSERT INTO sync_runs_v2 (
        id, account_user_id, mode, requested_count, fetched_count, new_count,
        query_type, search_mode, estimate_only, requests_count, posts_consumed, estimated_cost_usd, query_text,
        start_time, end_time, status, error_message, started_at, finished_at
      )
      SELECT
        id, account_user_id, mode, requested_count, fetched_count, new_count,
        COALESCE(query_type, 'timeline'),
        search_mode,
        COALESCE(estimate_only, 0),
        COALESCE(requests_count, 0),
        COALESCE(posts_consumed, 0),
        COALESCE(estimated_cost_usd, 0),
        query_text,
        start_time, end_time, status, error_message, started_at, finished_at
      FROM sync_runs;

      DROP TABLE sync_runs;
      ALTER TABLE sync_runs_v2 RENAME TO sync_runs;
    `);
  }

  upsertAccount(account: AccountRecord) {
    const now = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO accounts (
        user_id, username, display_name, description, protected, verified, profile_image_url,
        follower_count, following_count, post_count, raw_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        description = excluded.description,
        protected = excluded.protected,
        verified = excluded.verified,
        profile_image_url = excluded.profile_image_url,
        follower_count = excluded.follower_count,
        following_count = excluded.following_count,
        post_count = excluded.post_count,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `);

    statement.run(
      account.userId,
      account.username,
      account.displayName,
      account.description,
      account.protected ? 1 : 0,
      account.verified ? 1 : 0,
      account.profileImageUrl,
      account.followerCount,
      account.followingCount,
      account.postCount,
      JSON.stringify(account.raw),
      now,
      now
    );
  }

  getAccountByUserId(userId: string): AccountRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM accounts WHERE user_id = ?
    `).get(userId) as Record<string, unknown> | undefined;

    return row ? mapAccountRow(row) : null;
  }

  getAccountByUsername(username: string): AccountRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM accounts WHERE lower(username) = lower(?)
    `).get(username) as Record<string, unknown> | undefined;

    return row ? mapAccountRow(row) : null;
  }

  listAccounts(limit: number): ArchivedAccountRecord[] {
    const rows = this.db.prepare(`
      SELECT
        a.*,
        s.last_synced_post_id,
        s.last_synced_post_at,
        s.last_backfill_at,
        s.last_sync_at,
        COALESCE(p.total_posts, 0) AS total_posts
      FROM accounts a
      LEFT JOIN account_sync_state s ON s.account_user_id = a.user_id
      LEFT JOIN (
        SELECT author_user_id, COUNT(*) AS total_posts
        FROM posts
        GROUP BY author_user_id
      ) p ON p.author_user_id = a.user_id
      ORDER BY a.updated_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map(mapArchivedAccountRow);
  }

  getArchivedAccount(userId: string): ArchivedAccountRecord | null {
    const row = this.db.prepare(`
      SELECT
        a.*,
        s.last_synced_post_id,
        s.last_synced_post_at,
        s.last_backfill_at,
        s.last_sync_at,
        COALESCE(p.total_posts, 0) AS total_posts
      FROM accounts a
      LEFT JOIN account_sync_state s ON s.account_user_id = a.user_id
      LEFT JOIN (
        SELECT author_user_id, COUNT(*) AS total_posts
        FROM posts
        GROUP BY author_user_id
      ) p ON p.author_user_id = a.user_id
      WHERE a.user_id = ?
    `).get(userId) as Record<string, unknown> | undefined;

    return row ? mapArchivedAccountRow(row) : null;
  }

  getBillingSummary(input: {
    recentRunsLimit: number;
    accountLimit: number;
  }): BillingSummary {
    const summaryRow = this.db.prepare(`
      SELECT
        COUNT(*) AS total_runs,
        SUM(CASE WHEN estimate_only = 1 THEN 1 ELSE 0 END) AS estimate_runs,
        SUM(CASE WHEN estimate_only = 0 AND status = 'completed' THEN 1 ELSE 0 END) AS successful_write_runs,
        COALESCE(SUM(CASE WHEN estimate_only = 0 AND status = 'completed' THEN posts_consumed ELSE 0 END), 0) AS total_posts_consumed,
        ROUND(COALESCE(SUM(CASE WHEN estimate_only = 0 AND status = 'completed' THEN estimated_cost_usd ELSE 0 END), 0), 4) AS total_estimated_cost_usd
      FROM sync_runs
    `).get() as Record<string, unknown>;

    const recentRows = this.db.prepare(`
      SELECT
        s.id,
        s.account_user_id,
        a.username,
        s.mode,
        s.query_type,
        s.search_mode,
        s.estimate_only,
        s.requests_count,
        s.posts_consumed,
        s.estimated_cost_usd,
        s.status,
        s.started_at,
        s.finished_at,
        s.query_text,
        s.requested_count,
        s.fetched_count,
        s.new_count
      FROM sync_runs s
      LEFT JOIN accounts a ON a.user_id = s.account_user_id
      ORDER BY s.id DESC
      LIMIT ?
    `).all(input.recentRunsLimit) as Array<Record<string, unknown>>;

    const accountRows = this.db.prepare(`
      SELECT
        s.account_user_id,
        a.username,
        COUNT(*) AS runs,
        COALESCE(SUM(CASE WHEN s.estimate_only = 0 AND s.status = 'completed' THEN s.posts_consumed ELSE 0 END), 0) AS posts_consumed,
        ROUND(COALESCE(SUM(CASE WHEN s.estimate_only = 0 AND s.status = 'completed' THEN s.estimated_cost_usd ELSE 0 END), 0), 4) AS estimated_cost_usd
      FROM sync_runs s
      LEFT JOIN accounts a ON a.user_id = s.account_user_id
      GROUP BY s.account_user_id, a.username
      ORDER BY estimated_cost_usd DESC, posts_consumed DESC, runs DESC
      LIMIT ?
    `).all(input.accountLimit) as Array<Record<string, unknown>>;

    return {
      totalRuns: Number(summaryRow.total_runs || 0),
      successfulWriteRuns: Number(summaryRow.successful_write_runs || 0),
      estimateRuns: Number(summaryRow.estimate_runs || 0),
      totalPostsConsumed: Number(summaryRow.total_posts_consumed || 0),
      totalEstimatedCostUsd: Number(summaryRow.total_estimated_cost_usd || 0),
      recentRuns: recentRows.map(mapBillingRunRow),
      accounts: accountRows.map(mapBillingAccountRow)
    };
  }

  startSyncRun(input: {
    accountUserId: string | null;
    mode: "backfill" | "sync";
    requestedCount: number | null;
    queryType: "timeline" | "search";
    searchMode: "recent" | "full_archive" | null;
    estimateOnly: boolean;
    queryText: string | null;
    startTime: string | null;
    endTime: string | null;
  }): SyncRunResult {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO sync_runs (
        account_user_id, mode, requested_count, fetched_count, new_count,
        query_type, search_mode, estimate_only, requests_count, posts_consumed, estimated_cost_usd, query_text,
        start_time, end_time, status, started_at
      ) VALUES (?, ?, ?, 0, 0, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'running', ?)
    `).run(
      input.accountUserId,
      input.mode,
      input.requestedCount,
      input.queryType,
      input.searchMode,
      input.estimateOnly ? 1 : 0,
      input.queryText,
      input.startTime,
      input.endTime,
      now
    );

    return {
      id: Number(result.lastInsertRowid),
      accountUserId: input.accountUserId,
      mode: input.mode
    };
  }

  finishSyncRun(input: {
    syncRunId: number;
    fetchedCount: number;
    newCount: number;
    requestsCount: number;
    postsConsumed: number;
    estimatedCostUsd: number;
    status: "completed" | "failed";
    errorMessage?: string | null;
  }) {
    this.db.prepare(`
      UPDATE sync_runs
      SET fetched_count = ?, new_count = ?, requests_count = ?, posts_consumed = ?, estimated_cost_usd = ?, status = ?, error_message = ?, finished_at = ?
      WHERE id = ?
    `).run(
      input.fetchedCount,
      input.newCount,
      input.requestsCount,
      input.postsConsumed,
      input.estimatedCostUsd,
      input.status,
      input.errorMessage || null,
      new Date().toISOString(),
      input.syncRunId
    );
  }

  upsertPosts(posts: PostRecord[]) {
    let insertedCount = 0;
    this.db.exec("BEGIN");

    try {
      const insertPost = this.db.prepare(`
        INSERT INTO posts (
          post_id, author_user_id, text_raw, text_normalized, media_urls, created_at, lang,
          conversation_id, reply_count, like_count, repost_count, quote_count, bookmark_count,
          is_reply, is_repost, is_quote, source, ingest_source, matched_query, raw_json, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id) DO UPDATE SET
          author_user_id = excluded.author_user_id,
          text_raw = excluded.text_raw,
          text_normalized = excluded.text_normalized,
          media_urls = excluded.media_urls,
          created_at = excluded.created_at,
          lang = excluded.lang,
          conversation_id = excluded.conversation_id,
          reply_count = excluded.reply_count,
          like_count = excluded.like_count,
          repost_count = excluded.repost_count,
          quote_count = excluded.quote_count,
          bookmark_count = excluded.bookmark_count,
          is_reply = excluded.is_reply,
          is_repost = excluded.is_repost,
          is_quote = excluded.is_quote,
          source = excluded.source,
          ingest_source = excluded.ingest_source,
          matched_query = excluded.matched_query,
          raw_json = excluded.raw_json,
          ingested_at = excluded.ingested_at
      `);
      const existsStatement = this.db.prepare(`SELECT 1 FROM posts WHERE post_id = ?`);
      const deleteFts = this.db.prepare(`DELETE FROM posts_fts WHERE post_id = ?`);
      const insertFts = this.db.prepare(`
        INSERT INTO posts_fts (post_id, author_user_id, username, text_normalized)
        VALUES (?, ?, ?, ?)
      `);

      for (const post of posts) {
        const exists = !!existsStatement.get(post.postId);
        insertPost.run(
          post.postId,
          post.authorUserId,
          post.textRaw,
          post.textNormalized,
          JSON.stringify(post.mediaUrls),
          post.createdAt,
          post.lang,
          post.conversationId,
          post.replyCount,
          post.likeCount,
          post.repostCount,
          post.quoteCount,
          post.bookmarkCount,
          post.isReply ? 1 : 0,
          post.isRepost ? 1 : 0,
          post.isQuote ? 1 : 0,
          post.source,
          post.ingestSource,
          post.matchedQuery,
          JSON.stringify(post.raw),
          post.ingestedAt
        );
        deleteFts.run(post.postId);
        insertFts.run(post.postId, post.authorUserId, post.username, post.textNormalized);
        if (!exists) {
          insertedCount += 1;
        }
      }

      this.db.exec("COMMIT");
      return insertedCount;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertPostInsights(insights: PostInsightRecord[]) {
    if (insights.length === 0) {
      return;
    }

    this.db.exec("BEGIN");

    try {
      const statement = this.db.prepare(`
        INSERT INTO post_insights (
          post_id, analysis_status, analysis_version, embedding_vector,
          is_educational_score, is_educational, topic_scores_json,
          matched_labels_json, signal_flags_json, analyzed_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id) DO UPDATE SET
          analysis_status = excluded.analysis_status,
          analysis_version = excluded.analysis_version,
          embedding_vector = excluded.embedding_vector,
          is_educational_score = excluded.is_educational_score,
          is_educational = excluded.is_educational,
          topic_scores_json = excluded.topic_scores_json,
          matched_labels_json = excluded.matched_labels_json,
          signal_flags_json = excluded.signal_flags_json,
          analyzed_at = excluded.analyzed_at,
          error_message = excluded.error_message
      `);

      for (const insight of insights) {
        statement.run(
          insight.postId,
          insight.analysisStatus,
          insight.analysisVersion,
          insight.embeddingVector ? JSON.stringify(insight.embeddingVector) : null,
          insight.isEducationalScore,
          insight.isEducational === null ? null : (insight.isEducational ? 1 : 0),
          insight.topicScores ? JSON.stringify(insight.topicScores) : null,
          insight.matchedLabels ? JSON.stringify(insight.matchedLabels) : null,
          insight.signalFlags ? JSON.stringify(insight.signalFlags) : null,
          insight.analyzedAt,
          insight.errorMessage
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  updateSyncState(input: {
    accountUserId: string;
    lastSyncedPostId: string | null;
    lastSyncedPostAt: string | null;
    mode: "backfill" | "sync";
  }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO account_sync_state (
        account_user_id, last_synced_post_id, last_synced_post_at, last_backfill_at, last_sync_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_user_id) DO UPDATE SET
        last_synced_post_id = excluded.last_synced_post_id,
        last_synced_post_at = excluded.last_synced_post_at,
        last_backfill_at = CASE WHEN ? = 'backfill' THEN excluded.last_backfill_at ELSE account_sync_state.last_backfill_at END,
        last_sync_at = excluded.last_sync_at
    `).run(
      input.accountUserId,
      input.lastSyncedPostId,
      input.lastSyncedPostAt,
      input.mode === "backfill" ? now : null,
      now,
      input.mode
    );
  }

  getSyncState(accountUserId: string) {
    return this.db.prepare(`
      SELECT * FROM account_sync_state WHERE account_user_id = ?
    `).get(accountUserId) as Record<string, unknown> | undefined;
  }

  getArchiveScope(scopeKey: string): ArchiveScopeRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM archive_scopes WHERE scope_key = ?
    `).get(scopeKey) as Record<string, unknown> | undefined;

    return row ? mapArchiveScopeRow(row) : null;
  }

  listArchiveScopesForAccount(accountUserId: string) {
    const rows = this.db.prepare(`
      SELECT *
      FROM archive_scopes
      WHERE account_user_id = ?
      ORDER BY updated_at DESC, scope_kind ASC
    `).all(accountUserId) as Array<Record<string, unknown>>;

    return rows.map(mapArchiveScopeRow);
  }

  upsertArchiveScope(scope: ArchiveScopeRecord) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO archive_scopes (
        scope_key, account_user_id, scope_kind, query_text, search_mode,
        start_time, end_time, exclude_replies, exclude_retweets, exclude_quotes,
        newest_post_id, newest_post_at, oldest_post_id, oldest_post_at,
        local_post_count, coverage_complete, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        account_user_id = excluded.account_user_id,
        scope_kind = excluded.scope_kind,
        query_text = excluded.query_text,
        search_mode = excluded.search_mode,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        exclude_replies = excluded.exclude_replies,
        exclude_retweets = excluded.exclude_retweets,
        exclude_quotes = excluded.exclude_quotes,
        newest_post_id = excluded.newest_post_id,
        newest_post_at = excluded.newest_post_at,
        oldest_post_id = excluded.oldest_post_id,
        oldest_post_at = excluded.oldest_post_at,
        local_post_count = excluded.local_post_count,
        coverage_complete = excluded.coverage_complete,
        updated_at = excluded.updated_at
    `).run(
      scope.scopeKey,
      scope.accountUserId,
      scope.scopeKind,
      scope.queryText,
      scope.searchMode,
      scope.startTime,
      scope.endTime,
      scope.excludeReplies ? 1 : 0,
      scope.excludeRetweets ? 1 : 0,
      scope.excludeQuotes ? 1 : 0,
      scope.newestPostId,
      scope.newestPostAt,
      scope.oldestPostId,
      scope.oldestPostAt,
      scope.localPostCount,
      scope.coverageComplete ? 1 : 0,
      now
    );
  }

  countPostsForAccountScope(params: {
    accountUserId: string;
    startTime?: string | null;
    endTime?: string | null;
    excludeReplies: boolean;
    excludeRetweets: boolean;
    excludeQuotes: boolean;
  }) {
    const conditions = ["author_user_id = ?"];
    const values: unknown[] = [params.accountUserId];

    if (params.startTime) {
      conditions.push("created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("created_at <= ?");
      values.push(params.endTime);
    }
    if (params.excludeReplies) {
      conditions.push("is_reply = 0");
    }
    if (params.excludeRetweets) {
      conditions.push("is_repost = 0");
    }
    if (params.excludeQuotes) {
      conditions.push("is_quote = 0");
    }

    const row = this.db.prepare(`
      SELECT COUNT(*) AS total_count
      FROM posts
      WHERE ${conditions.join(" AND ")}
    `).get(...(values as never[])) as Record<string, unknown>;

    return Number(row.total_count || 0);
  }

  countPostsForQueryScope(params: {
    queryText: string;
    accountUserId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  }) {
    const conditions = ["matched_query = ?"];
    const values: unknown[] = [params.queryText];

    if (params.accountUserId) {
      conditions.push("author_user_id = ?");
      values.push(params.accountUserId);
    }
    if (params.startTime) {
      conditions.push("created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("created_at <= ?");
      values.push(params.endTime);
    }

    const row = this.db.prepare(`
      SELECT COUNT(*) AS total_count
      FROM posts
      WHERE ${conditions.join(" AND ")}
    `).get(...(values as never[])) as Record<string, unknown>;

    return Number(row.total_count || 0);
  }

  getAccountScopeStats(params: {
    accountUserId: string;
    startTime?: string | null;
    endTime?: string | null;
    excludeReplies: boolean;
    excludeRetweets: boolean;
    excludeQuotes: boolean;
  }) {
    const conditions = ["author_user_id = ?"];
    const values: unknown[] = [params.accountUserId];

    if (params.startTime) {
      conditions.push("created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("created_at <= ?");
      values.push(params.endTime);
    }
    if (params.excludeReplies) {
      conditions.push("is_reply = 0");
    }
    if (params.excludeRetweets) {
      conditions.push("is_repost = 0");
    }
    if (params.excludeQuotes) {
      conditions.push("is_quote = 0");
    }

    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        (SELECT post_id FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, post_id DESC LIMIT 1) AS newest_post_id,
        (SELECT created_at FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, post_id DESC LIMIT 1) AS newest_post_at,
        (SELECT post_id FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC, post_id ASC LIMIT 1) AS oldest_post_id,
        (SELECT created_at FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC, post_id ASC LIMIT 1) AS oldest_post_at
      FROM posts
      WHERE ${conditions.join(" AND ")}
    `).get(...([...values, ...values, ...values, ...values, ...values] as never[])) as Record<string, unknown>;

    return {
      totalCount: Number(row.total_count || 0),
      newestPostId: row.newest_post_id ? String(row.newest_post_id) : null,
      newestPostAt: row.newest_post_at ? String(row.newest_post_at) : null,
      oldestPostId: row.oldest_post_id ? String(row.oldest_post_id) : null,
      oldestPostAt: row.oldest_post_at ? String(row.oldest_post_at) : null
    };
  }

  getQueryScopeStats(params: {
    queryText: string;
    accountUserId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  }) {
    const conditions = ["matched_query = ?"];
    const values: unknown[] = [params.queryText];

    if (params.accountUserId) {
      conditions.push("author_user_id = ?");
      values.push(params.accountUserId);
    }
    if (params.startTime) {
      conditions.push("created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("created_at <= ?");
      values.push(params.endTime);
    }

    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total_count,
        (SELECT post_id FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, post_id DESC LIMIT 1) AS newest_post_id,
        (SELECT created_at FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, post_id DESC LIMIT 1) AS newest_post_at,
        (SELECT post_id FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC, post_id ASC LIMIT 1) AS oldest_post_id,
        (SELECT created_at FROM posts WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC, post_id ASC LIMIT 1) AS oldest_post_at
      FROM posts
      WHERE ${conditions.join(" AND ")}
    `).get(...([...values, ...values, ...values, ...values, ...values] as never[])) as Record<string, unknown>;

    return {
      totalCount: Number(row.total_count || 0),
      newestPostId: row.newest_post_id ? String(row.newest_post_id) : null,
      newestPostAt: row.newest_post_at ? String(row.newest_post_at) : null,
      oldestPostId: row.oldest_post_id ? String(row.oldest_post_id) : null,
      oldestPostAt: row.oldest_post_at ? String(row.oldest_post_at) : null
    };
  }

  listPostsForAnalysis(params: ListPostsForAnalysisParams) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.accountUserId) {
      conditions.push("p.author_user_id = ?");
      values.push(params.accountUserId);
    }

    if (params.reanalyzeAll) {
      conditions.push("1 = 1");
    } else if (params.onlyUnanalyzed) {
      conditions.push("(i.post_id IS NULL OR i.analysis_status != 'completed')");
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT
        p.*,
        a.username,
        i.analysis_status,
        i.analysis_version,
        i.embedding_vector,
        i.is_educational_score,
        i.is_educational,
        i.topic_scores_json,
        i.matched_labels_json,
        i.signal_flags_json,
        i.analyzed_at,
        i.error_message
      FROM posts p
      JOIN accounts a ON a.user_id = p.author_user_id
      LEFT JOIN post_insights i ON i.post_id = p.post_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(...([...values, params.limit] as never[])) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      ...mapPostListRow(row),
      raw: row.raw_json ? JSON.parse(String(row.raw_json)) as Record<string, unknown> : {},
      insight: mapPostInsightRow(row)
    }));
  }

  listSemanticCandidates(params: ListSemanticCandidatesParams) {
    const conditions: string[] = ["i.analysis_status = 'completed'"];
    const values: unknown[] = [];

    if (params.accountUserId) {
      conditions.push("p.author_user_id = ?");
      values.push(params.accountUserId);
    }
    if (params.startTime) {
      conditions.push("p.created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("p.created_at <= ?");
      values.push(params.endTime);
    }
    if (params.educationalOnly) {
      conditions.push("i.is_educational = 1");
    }

    const rows = this.db.prepare(`
      SELECT
        p.*,
        a.username,
        i.analysis_status,
        i.analysis_version,
        i.embedding_vector,
        i.is_educational_score,
        i.is_educational,
        i.topic_scores_json,
        i.matched_labels_json,
        i.signal_flags_json,
        i.analyzed_at,
        i.error_message
      FROM posts p
      JOIN accounts a ON a.user_id = p.author_user_id
      JOIN post_insights i ON i.post_id = p.post_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.created_at DESC
    `).all(...(values as never[])) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      ...mapPostListRow(row),
      raw: row.raw_json ? JSON.parse(String(row.raw_json)) as Record<string, unknown> : {},
      insight: mapPostInsightRow(row)
    }));
  }

  getInsightsSummary(input: {
    accountUserId?: string;
    topLabelsLimit: number;
  }): InsightsSummary {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (input.accountUserId) {
      conditions.push("p.author_user_id = ?");
      values.push(input.accountUserId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) AS total_posts,
        COALESCE(SUM(CASE WHEN i.analysis_status = 'completed' THEN 1 ELSE 0 END), 0) AS analyzed_posts,
        COALESCE(SUM(CASE WHEN i.analysis_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_posts,
        COALESCE(SUM(CASE WHEN i.analysis_status = 'completed' AND i.is_educational = 1 THEN 1 ELSE 0 END), 0) AS educational_posts,
        COALESCE(SUM(CASE WHEN i.post_id IS NULL OR i.analysis_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_posts,
        MAX(i.analysis_version) AS analysis_version
      FROM posts p
      LEFT JOIN post_insights i ON i.post_id = p.post_id
      ${where}
    `).get(...(values as never[])) as Record<string, unknown>;

    const labelConditions = [...conditions, "i.analysis_status = 'completed'"];
    const labelWhere = `WHERE ${labelConditions.join(" AND ")}`;
    const labelRows = this.db.prepare(`
      SELECT matched_labels_json
      FROM post_insights i
      JOIN posts p ON p.post_id = i.post_id
      ${labelWhere}
    `).all(...(values as never[])) as Array<Record<string, unknown>>;

    const counts = new Map<string, number>();
    for (const row of labelRows) {
      const labels = row.matched_labels_json ? JSON.parse(String(row.matched_labels_json)) as string[] : [];
      for (const label of labels) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }

    const topLabels = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, input.topLabelsLimit)
      .map(([label, count]) => ({
        label,
        count
      }));

    const totalPosts = Number(totals.total_posts || 0);
    const educationalPosts = Number(totals.educational_posts || 0);

    return {
      totalPosts,
      analyzedPosts: Number(totals.analyzed_posts || 0),
      pendingPosts: Number(totals.pending_posts || 0),
      failedPosts: Number(totals.failed_posts || 0),
      educationalPosts,
      educationalRatio: totalPosts ? Number((educationalPosts / totalPosts).toFixed(4)) : 0,
      topLabels: topLabels.map(entry => ({
        ...entry,
        titleTr: entry.label
      })),
      analysisVersion: totals.analysis_version ? String(totals.analysis_version) : null
    };
  }

  listPosts(params: ListPostsParams) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.accountUserId) {
      conditions.push("p.author_user_id = ?");
      values.push(params.accountUserId);
    }
    if (params.startTime) {
      conditions.push("p.created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("p.created_at <= ?");
      values.push(params.endTime);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT
        p.*,
        a.username,
        a.display_name
      FROM posts p
      JOIN accounts a ON a.user_id = p.author_user_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(...([...values, params.limit] as never[])) as Array<Record<string, unknown>>;

    return rows.map(mapPostListRow);
  }

  searchPosts(params: SearchPostsParams) {
    const conditions: string[] = ["f.text_normalized MATCH ?"];
    const values: unknown[] = [params.query];

    if (params.accountUserId) {
      conditions.push("p.author_user_id = ?");
      values.push(params.accountUserId);
    }
    if (params.startTime) {
      conditions.push("p.created_at >= ?");
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push("p.created_at <= ?");
      values.push(params.endTime);
    }

    const rows = this.db.prepare(`
      SELECT
        p.*,
        a.username,
        a.display_name
      FROM posts_fts f
      JOIN posts p ON p.post_id = f.post_id
      JOIN accounts a ON a.user_id = p.author_user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(...([...values, params.limit] as never[])) as Array<Record<string, unknown>>;

    return rows.map(mapPostListRow);
  }
}

function mapAccountRow(row: Record<string, unknown>): AccountRecord {
  return {
    userId: String(row.user_id),
    username: String(row.username),
    displayName: row.display_name ? String(row.display_name) : null,
    description: row.description ? String(row.description) : null,
    protected: Boolean(row.protected),
    verified: Boolean(row.verified),
    profileImageUrl: row.profile_image_url ? String(row.profile_image_url) : null,
    followerCount: row.follower_count === null ? null : Number(row.follower_count),
    followingCount: row.following_count === null ? null : Number(row.following_count),
    postCount: row.post_count === null ? null : Number(row.post_count),
    raw: JSON.parse(String(row.raw_json)) as Record<string, unknown>
  };
}

function mapArchivedAccountRow(row: Record<string, unknown>): ArchivedAccountRecord {
  return {
    userId: String(row.user_id),
    username: String(row.username),
    displayName: row.display_name ? String(row.display_name) : null,
    description: row.description ? String(row.description) : null,
    protected: Boolean(row.protected),
    verified: Boolean(row.verified),
    totalPosts: Number(row.total_posts || 0),
    lastSyncedPostId: row.last_synced_post_id ? String(row.last_synced_post_id) : null,
    lastSyncedPostAt: row.last_synced_post_at ? String(row.last_synced_post_at) : null,
    lastBackfillAt: row.last_backfill_at ? String(row.last_backfill_at) : null,
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    updatedAt: String(row.updated_at)
  };
}

function mapArchiveScopeRow(row: Record<string, unknown>): ArchiveScopeRecord {
  return {
    scopeKey: String(row.scope_key),
    accountUserId: row.account_user_id ? String(row.account_user_id) : null,
    scopeKind: String(row.scope_kind) as ArchiveScopeRecord["scopeKind"],
    queryText: row.query_text ? String(row.query_text) : null,
    searchMode: row.search_mode ? String(row.search_mode) as ArchiveScopeRecord["searchMode"] : null,
    startTime: row.start_time ? String(row.start_time) : null,
    endTime: row.end_time ? String(row.end_time) : null,
    excludeReplies: Boolean(row.exclude_replies),
    excludeRetweets: Boolean(row.exclude_retweets),
    excludeQuotes: Boolean(row.exclude_quotes),
    newestPostId: row.newest_post_id ? String(row.newest_post_id) : null,
    newestPostAt: row.newest_post_at ? String(row.newest_post_at) : null,
    oldestPostId: row.oldest_post_id ? String(row.oldest_post_id) : null,
    oldestPostAt: row.oldest_post_at ? String(row.oldest_post_at) : null,
    localPostCount: Number(row.local_post_count || 0),
    coverageComplete: Boolean(row.coverage_complete),
    updatedAt: String(row.updated_at)
  };
}

function mapPostListRow(row: Record<string, unknown>) {
  return {
    postId: String(row.post_id),
    authorUserId: String(row.author_user_id),
    username: String(row.username),
    displayName: row.display_name ? String(row.display_name) : null,
    textRaw: String(row.text_raw),
    textNormalized: String(row.text_normalized),
    mediaUrls: row.media_urls ? JSON.parse(String(row.media_urls)) as string[] : [],
    createdAt: String(row.created_at),
    lang: row.lang ? String(row.lang) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    replyCount: row.reply_count === null ? null : Number(row.reply_count),
    likeCount: row.like_count === null ? null : Number(row.like_count),
    repostCount: row.repost_count === null ? null : Number(row.repost_count),
    quoteCount: row.quote_count === null ? null : Number(row.quote_count),
    bookmarkCount: row.bookmark_count === null ? null : Number(row.bookmark_count),
    isReply: Boolean(row.is_reply),
    isRepost: Boolean(row.is_repost),
    isQuote: Boolean(row.is_quote),
    source: row.source ? String(row.source) : null,
    ingestSource: String(row.ingest_source || "timeline") as PostRecord["ingestSource"],
    matchedQuery: row.matched_query ? String(row.matched_query) : null,
    ingestedAt: String(row.ingested_at)
  };
}

function mapPostInsightRow(row: Record<string, unknown>): PostInsightRecord | null {
  if (!row.analysis_status) {
    return null;
  }

  return {
    postId: String(row.post_id),
    analysisStatus: String(row.analysis_status) as AnalysisStatus,
    analysisVersion: String(row.analysis_version),
    embeddingVector: row.embedding_vector ? JSON.parse(String(row.embedding_vector)) as number[] : null,
    isEducationalScore: row.is_educational_score === null ? null : Number(row.is_educational_score),
    isEducational: row.is_educational === null ? null : Boolean(row.is_educational),
    topicScores: row.topic_scores_json ? JSON.parse(String(row.topic_scores_json)) as Record<string, number> : null,
    matchedLabels: row.matched_labels_json ? JSON.parse(String(row.matched_labels_json)) as string[] : null,
    signalFlags: row.signal_flags_json ? JSON.parse(String(row.signal_flags_json)) as Record<string, unknown> : null,
    analyzedAt: row.analyzed_at ? String(row.analyzed_at) : null,
    errorMessage: row.error_message ? String(row.error_message) : null
  };
}

function mapBillingRunRow(row: Record<string, unknown>): BillingRunRecord {
  return {
    id: Number(row.id),
    accountUserId: row.account_user_id ? String(row.account_user_id) : null,
    username: row.username ? String(row.username) : null,
    mode: String(row.mode) as BillingRunRecord["mode"],
    queryType: String(row.query_type) as BillingRunRecord["queryType"],
    searchMode: row.search_mode ? String(row.search_mode) as BillingRunRecord["searchMode"] : null,
    estimateOnly: Boolean(row.estimate_only),
    requestsCount: Number(row.requests_count || 0),
    postsConsumed: Number(row.posts_consumed || 0),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    status: String(row.status),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    queryText: row.query_text ? String(row.query_text) : null,
    requestedCount: row.requested_count === null ? null : Number(row.requested_count),
    fetchedCount: Number(row.fetched_count || 0),
    newCount: Number(row.new_count || 0)
  };
}

function mapBillingAccountRow(row: Record<string, unknown>): BillingAccountRecord {
  return {
    accountUserId: row.account_user_id ? String(row.account_user_id) : null,
    username: row.username ? String(row.username) : null,
    runs: Number(row.runs || 0),
    postsConsumed: Number(row.posts_consumed || 0),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0)
  };
}
