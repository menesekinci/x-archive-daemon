export type ProviderHealthStatus = "ready" | "misconfigured" | "error";
export type DaemonStatus = "ready" | "misconfigured";

export interface ProviderHealth {
  configured: boolean;
  status: ProviderHealthStatus;
  lastError: string | null;
}

export interface AccountRecord {
  userId: string;
  username: string;
  displayName: string | null;
  description: string | null;
  protected: boolean;
  verified: boolean;
  profileImageUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  raw: Record<string, unknown>;
}

export interface ArchivedAccountRecord {
  userId: string;
  username: string;
  displayName: string | null;
  description: string | null;
  protected: boolean;
  verified: boolean;
  totalPosts: number;
  lastSyncedPostId: string | null;
  lastSyncedPostAt: string | null;
  lastBackfillAt: string | null;
  lastSyncAt: string | null;
  updatedAt: string;
}

export type ArchiveScopeKind =
  | "timeline_latest"
  | "timeline_window"
  | "original_latest"
  | "original_window"
  | "search_latest"
  | "search_window";

export interface ArchiveScopeRecord {
  scopeKey: string;
  accountUserId: string | null;
  scopeKind: ArchiveScopeKind;
  queryText: string | null;
  searchMode: "recent" | "full_archive" | null;
  startTime: string | null;
  endTime: string | null;
  excludeReplies: boolean;
  excludeRetweets: boolean;
  excludeQuotes: boolean;
  newestPostId: string | null;
  newestPostAt: string | null;
  oldestPostId: string | null;
  oldestPostAt: string | null;
  localPostCount: number;
  coverageComplete: boolean;
  updatedAt: string;
}

export interface PostRecord {
  postId: string;
  authorUserId: string;
  username: string;
  textRaw: string;
  textNormalized: string;
  mediaUrls: string[];
  createdAt: string;
  lang: string | null;
  conversationId: string | null;
  replyCount: number | null;
  likeCount: number | null;
  repostCount: number | null;
  quoteCount: number | null;
  bookmarkCount: number | null;
  isReply: boolean;
  isRepost: boolean;
  isQuote: boolean;
  source: string | null;
  ingestSource: "timeline" | "search";
  matchedQuery: string | null;
  raw: Record<string, unknown>;
  ingestedAt: string;
}

export interface IngestSummary {
  mode: "backfill" | "sync";
  queryType: "timeline" | "search";
  searchMode: "recent" | "full_archive" | null;
  account: AccountRecord | null;
  requestedCount: number | null;
  fetchedCount: number;
  newCount: number;
  requestsCount: number;
  postsConsumed: number;
  estimatedCostUsd: number;
  nextToken: string | null;
  estimateOnly: boolean;
  writePerformed: boolean;
  cacheHit: boolean;
  remoteFetchNeeded: boolean;
  localMatchedCount: number;
  missingCount: number;
  fetchStrategy: "local-only" | "extend-older" | "poll-newer" | "remote-window";
  coverageScope: {
    scopeKey: string;
    scopeKind: ArchiveScopeKind;
    coverageComplete: boolean;
  } | null;
  queryText: string | null;
  countEstimate: number | null;
  filters: {
    startTime: string | null;
    endTime: string | null;
    excludeReplies: boolean;
    excludeRetweets: boolean;
    excludeQuotes: boolean;
  };
}

export interface BillingRunRecord {
  id: number;
  accountUserId: string | null;
  username: string | null;
  mode: "backfill" | "sync";
  queryType: "timeline" | "search";
  searchMode: "recent" | "full_archive" | null;
  estimateOnly: boolean;
  requestsCount: number;
  postsConsumed: number;
  estimatedCostUsd: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  queryText: string | null;
  requestedCount: number | null;
  fetchedCount: number;
  newCount: number;
}

export interface BillingAccountRecord {
  accountUserId: string | null;
  username: string | null;
  runs: number;
  postsConsumed: number;
  estimatedCostUsd: number;
}

export interface BillingSummary {
  totalRuns: number;
  successfulWriteRuns: number;
  estimateRuns: number;
  totalPostsConsumed: number;
  totalEstimatedCostUsd: number;
  recentRuns: BillingRunRecord[];
  accounts: BillingAccountRecord[];
}

export type AnalysisStatus = "pending" | "completed" | "failed" | "skipped";

export interface PostInsightRecord {
  postId: string;
  analysisStatus: AnalysisStatus;
  analysisVersion: string;
  embeddingVector: number[] | null;
  isEducationalScore: number | null;
  isEducational: boolean | null;
  topicScores: Record<string, number> | null;
  matchedLabels: string[] | null;
  signalFlags: Record<string, unknown> | null;
  analyzedAt: string | null;
  errorMessage: string | null;
}

export interface AnalysisLabelRecord {
  label: string;
  titleTr: string;
  descriptionTr: string;
  aliases: string[];
  seedExamples: string[];
}

export interface AnalysisRunSummary {
  processedCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  remainingPendingCount: number;
  analysisVersion: string;
}

export interface SemanticSearchResult {
  postId: string;
  username: string;
  createdAt: string;
  textRaw: string;
  mediaUrls: string[];
  matchedLabels: string[];
  isEducational: boolean;
  isEducationalScore: number;
  semanticScore: number;
  topicScores: Record<string, number>;
}

export interface InsightsSummary {
  totalPosts: number;
  analyzedPosts: number;
  pendingPosts: number;
  failedPosts: number;
  educationalPosts: number;
  educationalRatio: number;
  topLabels: Array<{
    label: string;
    titleTr: string;
    count: number;
  }>;
  analysisVersion: string | null;
}
