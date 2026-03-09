import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { ArchiveDatabase } from "../src/database.js";
import type { AccountRecord, PostRecord } from "../src/provider-types.js";
import { createTempDir } from "./helpers.js";

function buildAccount(): AccountRecord {
  return {
    userId: "123",
    username: "sampleauthor",
    displayName: "Sample Author",
    description: "teacher",
    protected: false,
    verified: false,
    profileImageUrl: null,
    followerCount: 10,
    followingCount: 20,
    postCount: 30,
    raw: { id: "123" }
  };
}

function buildPost(id: string, text: string, createdAt: string): PostRecord {
  return {
    postId: id,
    authorUserId: "123",
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
    ingestedAt: "2026-03-08T10:00:00.000Z"
  };
}

test("ArchiveDatabase upserts posts without duplicates and supports FTS search", () => {
  const tempDir = createTempDir("x-archive-db-");
  const db = new ArchiveDatabase(path.join(tempDir, "archive.sqlite"));

  const account = buildAccount();
  db.upsertAccount(account);
  const inserted = db.upsertPosts([
    buildPost("1", "monolith daha basittir", "2026-03-01T10:00:00.000Z"),
    buildPost("2", "microservices her zaman gerekmez", "2026-03-02T10:00:00.000Z")
  ]);
  const insertedAgain = db.upsertPosts([
    buildPost("1", "monolith daha basittir", "2026-03-01T10:00:00.000Z")
  ]);

  assert.equal(inserted, 2);
  assert.equal(insertedAgain, 0);
  assert.equal(db.listPosts({ accountUserId: "123", limit: 10 }).length, 2);
  assert.equal(db.searchPosts({ accountUserId: "123", query: "microservices", limit: 10 }).length, 1);

  db.close();
});
