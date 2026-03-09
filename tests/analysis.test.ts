import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { executeRegisteredTool } from "../src/tool-executors.js";
import { getRuntime, shutdownRuntime } from "../src/runtime.js";
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
    ingestedAt: "2026-03-09T10:00:00.000Z",
    ...overrides
  };
}

test("analysis layer is optional and can analyze previously archived posts later", async () => {
  const tempDir = createTempDir("x-archive-analysis-");
  const credentialsPath = path.join(tempDir, "x.json");
  const dbPath = path.join(tempDir, "archive.sqlite");

  writeJson(credentialsPath, {
    authMode: "bearer_token",
    bearerToken: "token"
  });

  process.env.X_CREDENTIALS_FILE = credentialsPath;
  process.env.X_ARCHIVE_DB_PATH = dbPath;
  process.env.X_ARCHIVE_FAKE_ANALYSIS_MODEL = "1";

  await shutdownRuntime();
  const runtime = await getRuntime();
  runtime.database.upsertAccount(buildAccount());
  runtime.database.upsertPosts([
    buildPost("p1", "Monolith cogu durumda microservice'e gore daha sagliklidir.", "2026-03-08T10:00:00.000Z"),
    buildPost("p2", "API versioning yaparken backward compatibility kritik konudur.", "2026-03-07T10:00:00.000Z"),
    buildPost("p3", "@biri katiliyorum", "2026-03-06T10:00:00.000Z", {
      isReply: true
    })
  ]);

  const noAnalysisYet = await executeRegisteredTool("archive.posts.semantic_search", {
    username: "sampleauthor",
    query: "coding ile ilgili ogretici bilgiler",
    educationalOnly: true,
    limit: 10
  });

  assert.equal((noAnalysisYet as { analyzedPosts: number }).analyzedPosts, 0);
  assert.equal((noAnalysisYet as { results: unknown[] }).results.length, 0);

  const analysisRun = await executeRegisteredTool("analysis.posts.run", {
    username: "sampleauthor",
    limit: 10,
    onlyUnanalyzed: true
  });

  assert.equal((analysisRun as { analysis: { processedCount: number; completedCount: number } }).analysis.processedCount, 3);
  assert.equal((analysisRun as { analysis: { completedCount: number } }).analysis.completedCount, 3);

  const semanticSearch = await executeRegisteredTool("archive.posts.semantic_search", {
    username: "sampleauthor",
    query: "microservice yerine ne zaman monolith secilir",
    educationalOnly: true,
    limit: 5
  });

  assert.equal((semanticSearch as { results: Array<{ postId: string; matchedLabels: string[] }> }).results[0]?.postId, "p1");
  assert.ok((semanticSearch as { results: Array<{ matchedLabels: string[] }> }).results[0]?.matchedLabels.includes("monolith_vs_microservices"));

  const summary = await executeRegisteredTool("archive.insights.summary", {
    username: "sampleauthor",
    topLabelsLimit: 5
  });

  assert.equal((summary as { insights: { analyzedPosts: number; educationalPosts: number; analysisAvailable: boolean } }).insights.analyzedPosts, 3);
  assert.equal((summary as { insights: { analysisAvailable: boolean } }).insights.analysisAvailable, true);
  assert.ok((summary as { insights: { topLabels: Array<{ label: string }> } }).insights.topLabels.length > 0);

  delete process.env.X_ARCHIVE_FAKE_ANALYSIS_MODEL;
  await shutdownRuntime();
});
