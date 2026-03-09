import { z } from "zod";

const oneIdentityMessage = "Provide either username or userId.";

const IdentityFields = {
  username: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
};

const IdentityInput = z.object(IdentityFields).refine(input => !!input.username || !!input.userId, {
  message: oneIdentityMessage
});

const optionalTime = z.string().datetime().optional();

export const ResolveAccountInput = IdentityInput;

export const BackfillAccountInput = z.object({
  ...IdentityFields,
  targetCount: z.number().int().min(1).max(3200).default(100),
  startTime: optionalTime,
  endTime: optionalTime,
  excludeReplies: z.boolean().default(false),
  excludeRetweets: z.boolean().default(false),
  estimateOnly: z.boolean().default(false)
}).refine(input => !!input.username || !!input.userId, {
  message: oneIdentityMessage
});

export const BackfillOriginalAccountInput = z.object({
  ...IdentityFields,
  searchMode: z.enum(["recent", "full_archive"]).default("recent"),
  targetCount: z.number().int().min(1).max(10000).default(100),
  startTime: optionalTime,
  endTime: optionalTime,
  estimateOnly: z.boolean().default(false)
}).refine(input => !!input.username || !!input.userId, {
  message: oneIdentityMessage
});

export const SyncAccountInput = z.object({
  ...IdentityFields,
  startTime: optionalTime,
  endTime: optionalTime,
  excludeReplies: z.boolean().default(false),
  excludeRetweets: z.boolean().default(false)
}).refine(input => !!input.username || !!input.userId, {
  message: oneIdentityMessage
});

export const ArchivePostsListInput = z.object({
  ...IdentityFields,
  startTime: optionalTime,
  endTime: optionalTime,
  limit: z.number().int().min(1).max(500).default(50)
});

export const ArchivePostsSearchInput = z.object({
  ...IdentityFields,
  query: z.string().min(1),
  startTime: optionalTime,
  endTime: optionalTime,
  limit: z.number().int().min(1).max(100).default(20)
});

export const ArchiveAccountsListInput = z.object({
  limit: z.number().int().min(1).max(500).default(100)
});

export const ArchiveAccountsGetInput = IdentityInput;

export const ArchiveBillingSummaryInput = z.object({
  recentRunsLimit: z.number().int().min(1).max(100).default(10),
  accountLimit: z.number().int().min(1).max(100).default(20)
});

export const AnalysisPostsRunInput = z.object({
  ...IdentityFields,
  limit: z.number().int().min(1).max(1000).default(200),
  reanalyzeAll: z.boolean().default(false),
  onlyUnanalyzed: z.boolean().default(true)
});

export const AnalysisLabelsListInput = z.object({});

export const ArchiveSemanticSearchInput = z.object({
  ...IdentityFields,
  query: z.string().min(1),
  labels: z.array(z.string().min(1)).default([]),
  educationalOnly: z.boolean().default(true),
  startTime: optionalTime,
  endTime: optionalTime,
  limit: z.number().int().min(1).max(100).default(20)
});

export const ArchiveInsightsSummaryInput = z.object({
  ...IdentityFields,
  topLabelsLimit: z.number().int().min(1).max(50).default(10)
});

export const SearchBackfillInput = z.object({
  query: z.string().min(1),
  searchMode: z.enum(["recent", "full_archive"]).default("recent"),
  targetCount: z.number().int().min(1).max(10000).default(100),
  startTime: optionalTime,
  endTime: optionalTime,
  estimateOnly: z.boolean().default(false)
});
