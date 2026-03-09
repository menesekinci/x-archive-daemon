import test from "node:test";
import assert from "node:assert/strict";

import { XClient } from "../src/x-client.js";

function createSdkStub() {
  return {
    users: {
      async getByUsername(username: string) {
        return {
          data: {
            id: "2244994945",
            username,
            name: "X Developers",
            description: "Docs",
            protected: false,
            verified: true,
            publicMetrics: {
              followersCount: 10,
              followingCount: 20,
              tweetCount: 30
            }
          }
        };
      },
      async getById(userId: string) {
        return {
          data: {
            id: userId,
            username: "XDevelopers",
            name: "X Developers",
            protected: false,
            verified: true,
            publicMetrics: {
              followersCount: 10,
              followingCount: 20,
              tweetCount: 30
            }
          }
        };
      },
      async getPosts(userId: string, options?: Record<string, unknown>) {
        const paginationToken = typeof options?.paginationToken === "string" ? options.paginationToken : undefined;

        if (paginationToken === "page2") {
          return {
            data: [
              {
                id: "2",
                text: "ikinci sayfa",
                authorId: userId,
                createdAt: "2026-03-02T10:00:00.000Z",
                lang: "tr",
                conversationId: "2",
                publicMetrics: { replyCount: 0, likeCount: 1, retweetCount: 0, quoteCount: 0, bookmarkCount: 0 }
              }
            ],
            meta: { resultCount: 1 }
          };
        }

        return {
          data: [
            {
              id: "1",
              text: "monolith wins",
              authorId: userId,
              attachments: {
                mediaKeys: ["3_1"]
              },
              createdAt: "2026-03-01T10:00:00.000Z",
              lang: "en",
              conversationId: "1",
              publicMetrics: {
                replyCount: 1,
                likeCount: 2,
                retweetCount: 3,
                quoteCount: 4,
                bookmarkCount: 5
              },
              referencedTweets: [{ type: "quoted", id: "99" }]
            }
          ],
          includes: {
            media: [
              {
                mediaKey: "3_1",
                type: "photo",
                url: "https://pbs.twimg.com/media/1.jpg"
              }
            ]
          },
          meta: {
            resultCount: 1,
            nextToken: "page2"
          }
        };
      }
    },
    posts: {
      async searchRecent(query: string) {
        return {
          data: [
            {
              id: "r1",
              text: `recent ${query}`,
              authorId: "u1",
              attachments: {
                mediaKeys: ["3_2"]
              },
              createdAt: "2026-03-03T10:00:00.000Z",
              conversationId: "r1",
              lang: "tr",
              publicMetrics: { replyCount: 0, likeCount: 1, retweetCount: 0, quoteCount: 0, bookmarkCount: 0 }
            }
          ],
          includes: {
            users: [
              {
                id: "u1",
                username: "sampleauthor",
                name: "Sample Author",
                protected: false,
                verified: false
              }
            ],
            media: [
              {
                mediaKey: "3_2",
                type: "photo",
                url: "https://pbs.twimg.com/media/search.jpg"
              }
            ]
          },
          meta: { resultCount: 1, nextToken: "next-search" }
        };
      },
      async searchAll(query: string) {
        return {
          data: [
            {
              id: "a1",
              text: `archive ${query}`,
              authorId: "u2",
              createdAt: "2025-01-03T10:00:00.000Z",
              conversationId: "a1",
              lang: "tr",
              publicMetrics: { replyCount: 0, likeCount: 2, retweetCount: 0, quoteCount: 0, bookmarkCount: 0 }
            }
          ],
          includes: {
            users: [
              {
                id: "u2",
                username: "arsivhesap",
                name: "Arsiv Hesap",
                protected: false,
                verified: false
              }
            ]
          },
          meta: { resultCount: 1 }
        };
      },
      async getCountsRecent() {
        return {
          data: [
            { tweetCount: 3 },
            { tweetCount: 7 }
          ]
        };
      },
      async getCountsAll() {
        return {
          data: [
            { tweetCount: 10 },
            { tweetCount: 15 }
          ]
        };
      }
    }
  };
}

test("XClient maps user lookup and timeline responses via official XDK shape", async () => {
  const client = new XClient({
    authMode: "bearer_token",
    bearerToken: "test"
  }, createSdkStub() as never);

  const user = await client.getUserByUsername("XDevelopers");
  const timeline = await client.getTimeline({ account: user, maxResults: 100 });
  const nextPage = await client.getTimeline({ account: user, maxResults: 100, nextToken: timeline.nextToken || undefined });

  assert.equal(user.username, "XDevelopers");
  assert.equal(user.verified, true);
  assert.equal(timeline.posts.length, 1);
  assert.equal(timeline.posts[0]?.isQuote, true);
  assert.equal(timeline.posts[0]?.quoteCount, 4);
  assert.deepEqual(timeline.posts[0]?.mediaUrls, ["https://pbs.twimg.com/media/1.jpg"]);
  assert.equal(nextPage.posts[0]?.postId, "2");
});

test("XClient maps recent/full archive search and count responses", async () => {
  const client = new XClient({
    authMode: "bearer_token",
    bearerToken: "test"
  }, createSdkStub() as never);

  const recent = await client.searchPosts({
    query: "(from:sampleauthor) monolith",
    searchMode: "recent",
    maxResults: 10
  });
  const fullArchive = await client.searchPosts({
    query: "(from:sampleauthor) microservices",
    searchMode: "full_archive",
    maxResults: 10
  });
  const recentCount = await client.countPosts({
    query: "monolith",
    searchMode: "recent"
  });
  const fullArchiveCount = await client.countPosts({
    query: "microservices",
    searchMode: "full_archive"
  });

  assert.equal(recent.accounts[0]?.username, "sampleauthor");
  assert.equal(recent.posts[0]?.matchedQuery, "(from:sampleauthor) monolith");
  assert.deepEqual(recent.posts[0]?.mediaUrls, ["https://pbs.twimg.com/media/search.jpg"]);
  assert.equal(fullArchive.accounts[0]?.username, "arsivhesap");
  assert.equal(fullArchive.posts[0]?.ingestSource, "search");
  assert.equal(recentCount.totalCount, 10);
  assert.equal(fullArchiveCount.totalCount, 25);
});
