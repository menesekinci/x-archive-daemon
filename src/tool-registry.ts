import { z, type ZodTypeAny } from "zod";

import {
  AnalysisLabelsListInput,
  AnalysisPostsRunInput,
  ArchiveAccountsGetInput,
  ArchiveBillingSummaryInput,
  ArchiveAccountsListInput,
  ArchiveInsightsSummaryInput,
  ArchivePostsListInput,
  ArchiveSemanticSearchInput,
  ArchivePostsSearchInput,
  BackfillAccountInput,
  BackfillOriginalAccountInput,
  ResolveAccountInput,
  SearchBackfillInput,
  SyncAccountInput
} from "./tool-schemas.js";

export interface ToolDefinition<TSchema extends ZodTypeAny = ZodTypeAny> {
  name: string;
  group: string;
  description: string;
  inputSchema: TSchema;
  readOnly: boolean;
  riskLevel: "safe-read" | "operator-write";
  requiresConfirmation: boolean;
  riskSummary: string;
  exampleInput?: Record<string, unknown>;
}

type AnyToolDefinition = ToolDefinition<ZodTypeAny>;

function defineTool<TSchema extends ZodTypeAny>(definition: ToolDefinition<TSchema>): AnyToolDefinition {
  return definition as unknown as AnyToolDefinition;
}

function getSchemaDescription(schema: ZodTypeAny): string | undefined {
  return (schema as { description?: string }).description ?? schema._def.description;
}

function unwrapSchema(schema: ZodTypeAny): { schema: ZodTypeAny; optional: boolean } {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return {
      schema: schema._def.innerType as ZodTypeAny,
      optional: true
    };
  }

  return {
    schema,
    optional: false
  };
}

function schemaToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const shape = schema.shape as Record<string, ZodTypeAny>;

    for (const [key, rawSchema] of Object.entries(shape)) {
      const { schema: innerSchema, optional } = unwrapSchema(rawSchema);
      properties[key] = schemaToJsonSchema(innerSchema);
      if (!optional) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      description: getSchemaDescription(schema)
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string", description: getSchemaDescription(schema) };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: getSchemaDescription(schema) };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: getSchemaDescription(schema) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options, description: getSchemaDescription(schema) };
  }
  if (schema instanceof z.ZodEffects) {
    return schemaToJsonSchema(schema._def.schema as ZodTypeAny);
  }

  return { description: getSchemaDescription(schema) };
}

export const toolRegistry: AnyToolDefinition[] = [
  defineTool({
    name: "sources.accounts.resolve",
    group: "sources.accounts",
    description: "Resolves a public X account by username or userId.",
    inputSchema: ResolveAccountInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Queries X for account identity metadata.",
    exampleInput: { username: "XDevelopers" }
  }),
  defineTool({
    name: "ingest.accounts.backfill",
    group: "ingest.accounts",
    description: "Fetches a public account timeline from X and stores it in the local archive. Use this only when the user explicitly wants the full timeline, including replies, retweets, or quote tweets.",
    inputSchema: BackfillAccountInput,
    readOnly: false,
    riskLevel: "operator-write",
    requiresConfirmation: true,
    riskSummary: "Writes fetched timeline data into the local SQLite archive and consumes X API credits.",
    exampleInput: { username: "XDevelopers", targetCount: 1000, excludeReplies: true, excludeRetweets: true }
  }),
  defineTool({
    name: "ingest.accounts.original_backfill",
    group: "ingest.accounts",
    description: "Fetches only original posts for a public account and stores them in the local archive. This is the default tool when the user generically asks to collect posts or tweets.",
    inputSchema: BackfillOriginalAccountInput,
    readOnly: false,
    riskLevel: "operator-write",
    requiresConfirmation: true,
    riskSummary: "Writes only original posts (no replies, retweets, or quote tweets) into the local SQLite archive and consumes X API credits.",
    exampleInput: { username: "XDevelopers", searchMode: "recent", targetCount: 100, estimateOnly: true }
  }),
  defineTool({
    name: "ingest.accounts.sync",
    group: "ingest.accounts",
    description: "Fetches only new posts for a previously archived account and stores them locally.",
    inputSchema: SyncAccountInput,
    readOnly: false,
    riskLevel: "operator-write",
    requiresConfirmation: true,
    riskSummary: "Writes new timeline data into the local SQLite archive and consumes X API credits.",
    exampleInput: { username: "XDevelopers", excludeReplies: true, excludeRetweets: true }
  }),
  defineTool({
    name: "ingest.search.backfill",
    group: "ingest.search",
    description: "Fetches posts matching an X search query and stores them in the local archive.",
    inputSchema: SearchBackfillInput,
    readOnly: false,
    riskLevel: "operator-write",
    requiresConfirmation: true,
    riskSummary: "Writes search results into the local SQLite archive and consumes X API credits.",
    exampleInput: {
      query: "(from:sampleauthor) (monolith OR microservices)",
      searchMode: "recent",
      targetCount: 500,
      estimateOnly: false
    }
  }),
  defineTool({
    name: "archive.posts.list",
    group: "archive.posts",
    description: "Lists archived posts from the local SQLite store.",
    inputSchema: ArchivePostsListInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Queries local archived posts.",
    exampleInput: { username: "XDevelopers", limit: 50 }
  }),
  defineTool({
    name: "archive.posts.search",
    group: "archive.posts",
    description: "Searches archived post text locally using SQLite FTS.",
    inputSchema: ArchivePostsSearchInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Searches local archived posts.",
    exampleInput: { username: "XDevelopers", query: "microservices", limit: 20 }
  }),
  defineTool({
    name: "archive.accounts.list",
    group: "archive.accounts",
    description: "Lists archived accounts and their sync state from the local store.",
    inputSchema: ArchiveAccountsListInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Queries local archived account metadata.",
    exampleInput: { limit: 100 }
  }),
  defineTool({
    name: "archive.accounts.get",
    group: "archive.accounts",
    description: "Reads one archived account, its sync status, and the coverage scopes already collected in the local store.",
    inputSchema: ArchiveAccountsGetInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Queries local archived account metadata.",
    exampleInput: { username: "XDevelopers" }
  }),
  defineTool({
    name: "archive.billing.summary",
    group: "archive.billing",
    description: "Summarizes local X API usage costs, consumed posts, recent ingest runs, and account-level cost breakdowns from the SQLite archive.",
    inputSchema: ArchiveBillingSummaryInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Summarizes local cost and usage records from previous ingest runs.",
    exampleInput: { recentRunsLimit: 10, accountLimit: 20 }
  }),
  defineTool({
    name: "analysis.posts.run",
    group: "analysis.posts",
    description: "Analyzes already archived posts locally, adds educational/topic signals, and stores insights. Works for both old and newly ingested posts.",
    inputSchema: AnalysisPostsRunInput,
    readOnly: false,
    riskLevel: "operator-write",
    requiresConfirmation: true,
    riskSummary: "Writes local analysis results into SQLite. Does not call X, but can take time and use CPU.",
    exampleInput: { username: "sampleauthor", onlyUnanalyzed: true, limit: 200 }
  }),
  defineTool({
    name: "analysis.labels.list",
    group: "analysis.labels",
    description: "Lists the local educational/topic label catalog used by the semantic analysis layer.",
    inputSchema: AnalysisLabelsListInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Returns the local label catalog and descriptions.",
    exampleInput: {}
  }),
  defineTool({
    name: "archive.posts.semantic_search",
    group: "archive.posts",
    description: "Runs local semantic search over analyzed archived posts using the optional analysis layer.",
    inputSchema: ArchiveSemanticSearchInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Searches only the local analyzed archive.",
    exampleInput: { username: "sampleauthor", query: "coding ile ilgili ogretici bilgiler", educationalOnly: true, limit: 10 }
  }),
  defineTool({
    name: "archive.insights.summary",
    group: "archive.insights",
    description: "Summarizes how much of the local archive has been analyzed, the educational content ratio, and the dominant labels.",
    inputSchema: ArchiveInsightsSummaryInput,
    readOnly: true,
    riskLevel: "safe-read",
    requiresConfirmation: false,
    riskSummary: "Read-only. Summarizes local analysis coverage.",
    exampleInput: { username: "sampleauthor", topLabelsLimit: 10 }
  })
];

export function getToolDefinition(name: string, registry: readonly ToolDefinition[] = toolRegistry) {
  return registry.find(tool => tool.name === name);
}

export function listToolCatalog(registry: readonly ToolDefinition[] = toolRegistry) {
  return registry.map(tool => ({
    name: tool.name,
    group: tool.group,
    description: tool.description,
    readOnly: tool.readOnly,
    riskLevel: tool.riskLevel,
    requiresConfirmation: tool.requiresConfirmation,
    riskSummary: tool.riskSummary,
    exampleInput: tool.exampleInput,
    inputSchema: schemaToJsonSchema(tool.inputSchema)
  }));
}
