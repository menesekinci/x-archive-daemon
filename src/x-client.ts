import { ApiError, Client, PostPaginator, type PaginatedResponse } from "@xdevplatform/xdk";

import { AccountNotFoundError, ProtectedAccountError, XArchiveError } from "./errors.js";
import type { XCredentials } from "./config.js";
import type { AccountRecord, PostRecord } from "./provider-types.js";
import { normalizeText } from "./normalize.js";

const USER_FIELDS = [
  "created_at",
  "description",
  "profile_image_url",
  "protected",
  "public_metrics",
  "verified"
] as const;

const POST_FIELDS = [
  "author_id",
  "attachments",
  "created_at",
  "conversation_id",
  "lang",
  "public_metrics",
  "referenced_tweets",
  "source"
] as const;

const MEDIA_FIELDS = [
  "preview_image_url",
  "type",
  "url"
] as const;

type SearchMode = "recent" | "full_archive";

interface XUserLike {
  id: string;
  username?: string;
  name?: string;
  description?: string;
  protected?: boolean;
  verified?: boolean;
  profileImageUrl?: string;
  profile_image_url?: string;
  publicMetrics?: {
    followersCount?: number;
    followingCount?: number;
    tweetCount?: number;
  };
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
  };
}

interface XPostLike {
  id: string;
  text?: string;
  authorId?: string;
  author_id?: string;
  createdAt?: string;
  created_at?: string;
  lang?: string;
  conversationId?: string;
  conversation_id?: string;
  source?: string;
  attachments?: {
    mediaKeys?: string[];
    media_keys?: string[];
  };
  publicMetrics?: {
    replyCount?: number;
    likeCount?: number;
    retweetCount?: number;
    quoteCount?: number;
    bookmarkCount?: number;
  };
  public_metrics?: {
    reply_count?: number;
    like_count?: number;
    retweet_count?: number;
    quote_count?: number;
    bookmark_count?: number;
  };
  referencedTweets?: Array<{ type: "retweeted" | "replied_to" | "quoted"; id: string }>;
  referenced_tweets?: Array<{ type: "retweeted" | "replied_to" | "quoted"; id: string }>;
}

interface XMediaLike {
  mediaKey?: string;
  media_key?: string;
  type?: string;
  url?: string;
  previewImageUrl?: string;
  preview_image_url?: string;
}

interface XCountLike {
  tweetCount?: number;
  tweet_count?: number;
}

type XdkLikeClient = {
  users: {
    getByUsername(username: string, options?: Record<string, unknown>): Promise<{ data?: XUserLike }>;
    getById(userId: string, options?: Record<string, unknown>): Promise<{ data?: XUserLike }>;
    getPosts(userId: string, options?: Record<string, unknown>): Promise<{ data?: XPostLike[]; includes?: { users?: XUserLike[]; media?: XMediaLike[] }; meta?: { nextToken?: string; resultCount?: number } }>;
  };
  posts: {
    searchRecent(query: string, options?: Record<string, unknown>): Promise<{ data?: XPostLike[]; includes?: { users?: XUserLike[]; media?: XMediaLike[] }; meta?: { nextToken?: string; resultCount?: number } }>;
    searchAll(query: string, options?: Record<string, unknown>): Promise<{ data?: XPostLike[]; includes?: { users?: XUserLike[]; media?: XMediaLike[] }; meta?: { nextToken?: string; resultCount?: number } }>;
    getCountsRecent(query: string, options?: Record<string, unknown>): Promise<{ data?: XCountLike[] }>;
    getCountsAll(query: string, options?: Record<string, unknown>): Promise<{ data?: XCountLike[] }>;
  };
};

export interface TimelineRequest {
  account: AccountRecord;
  maxResults?: number;
  nextToken?: string;
  sinceId?: string;
  untilId?: string;
  startTime?: string;
  endTime?: string;
  excludeReplies?: boolean;
  excludeRetweets?: boolean;
}

export interface SearchRequest {
  query: string;
  searchMode: SearchMode;
  maxResults?: number;
  nextToken?: string;
  sinceId?: string;
  untilId?: string;
  startTime?: string;
  endTime?: string;
}

interface TimelineResponse {
  posts: PostRecord[];
  nextToken: string | null;
  resultCount: number;
}

interface SearchResponse {
  accounts: AccountRecord[];
  posts: PostRecord[];
  nextToken: string | null;
  resultCount: number;
}

interface CountResponse {
  totalCount: number;
}

export class XClient {
  private readonly client: XdkLikeClient;

  constructor(
    credentials: XCredentials,
    sdkClient?: XdkLikeClient
  ) {
    this.client = sdkClient || new Client({
      bearerToken: credentials.bearerToken
    }) as unknown as XdkLikeClient;
  }

  async probe() {
    await this.getUserByUsername("XDevelopers");
  }

  async getUserByUsername(username: string) {
    try {
      const response = await this.client.users.getByUsername(username, {
        userFields: [...USER_FIELDS]
      });

      if (!response.data) {
        throw new AccountNotFoundError(`Account not found for username: ${username}`);
      }

      return mapUser(response.data);
    } catch (error) {
      throw mapSdkError(error, "user_lookup", username);
    }
  }

  async getUserById(userId: string) {
    try {
      const response = await this.client.users.getById(userId, {
        userFields: [...USER_FIELDS]
      });

      if (!response.data) {
        throw new AccountNotFoundError(`Account not found for userId: ${userId}`);
      }

      return mapUser(response.data);
    } catch (error) {
      throw mapSdkError(error, "user_lookup", userId);
    }
  }

  createTimelinePaginator(input: TimelineRequest) {
    return new PostPaginator(async (token?: string): Promise<PaginatedResponse<XPostLike>> => {
      try {
        const response = await this.client.users.getPosts(input.account.userId, {
          maxResults: Math.min(Math.max(input.maxResults || 100, 10), 100),
          paginationToken: token ?? input.nextToken,
          sinceId: input.sinceId,
          untilId: input.untilId,
          startTime: input.startTime,
          endTime: input.endTime,
          exclude: buildExclude(input.excludeReplies, input.excludeRetweets),
          tweetFields: [...POST_FIELDS],
          expansions: ["attachments.media_keys"],
          mediaFields: [...MEDIA_FIELDS]
        });

        return {
          data: response.data || [],
          meta: normalizeMeta(response.meta),
          includes: response.includes
        };
      } catch (error) {
        throw mapSdkError(error, "timeline", input.account.username);
      }
    });
  }

  async getTimeline(input: TimelineRequest): Promise<TimelineResponse> {
    const paginator = this.createTimelinePaginator(input);
    await paginator.fetchNext();
    const mediaByKey = buildMediaMap(Array.isArray(paginator.includes?.media) ? paginator.includes.media as XMediaLike[] : []);
    const posts = paginator.items.map(post => mapTimelinePost(post, input.account, mediaByKey));

    return {
      posts,
      nextToken: paginator.meta?.nextToken || null,
      resultCount: paginator.meta?.resultCount || posts.length
    };
  }

  createSearchPaginator(input: SearchRequest) {
    return new PostPaginator(async (token?: string): Promise<PaginatedResponse<XPostLike>> => {
      try {
        const method = input.searchMode === "recent" ? "searchRecent" : "searchAll";
        const response = await this.client.posts[method](input.query, {
          maxResults: Math.min(Math.max(input.maxResults || 100, 10), 100),
          paginationToken: token ?? input.nextToken,
          sinceId: input.sinceId,
          untilId: input.untilId,
          startTime: input.startTime,
          endTime: input.endTime,
          tweetFields: [...POST_FIELDS],
          expansions: ["author_id", "attachments.media_keys"],
          userFields: [...USER_FIELDS],
          mediaFields: [...MEDIA_FIELDS]
        });

        return {
          data: response.data || [],
          meta: normalizeMeta(response.meta),
          includes: response.includes
        };
      } catch (error) {
        throw mapSdkError(error, input.searchMode === "full_archive" ? "search_all" : "search_recent", input.query);
      }
    });
  }

  async searchPosts(input: SearchRequest): Promise<SearchResponse> {
    const paginator = this.createSearchPaginator(input);
    await paginator.fetchNext();
    const posts = paginator.items as XPostLike[];
    const includesUsers = Array.isArray(paginator.includes?.users) ? paginator.includes.users as XUserLike[] : [];
    const mediaByKey = buildMediaMap(Array.isArray(paginator.includes?.media) ? paginator.includes.media as XMediaLike[] : []);
    const accountById = new Map(includesUsers.map(user => {
      const account = mapUser(user);
      return [account.userId, account] as const;
    }));
    const mappedPosts = posts.map(post => mapSearchPost(post, accountById, mediaByKey, input.query));
    const accounts = Array.from(accountById.values());

    return {
      accounts,
      posts: mappedPosts,
      nextToken: paginator.meta?.nextToken || null,
      resultCount: paginator.meta?.resultCount || mappedPosts.length
    };
  }

  async countPosts(input: Pick<SearchRequest, "query" | "searchMode" | "startTime" | "endTime" | "sinceId" | "untilId">): Promise<CountResponse> {
    try {
      const method = input.searchMode === "recent" ? "getCountsRecent" : "getCountsAll";
      const response = await this.client.posts[method](input.query, {
        sinceId: input.sinceId,
        untilId: input.untilId,
        startTime: input.startTime,
        endTime: input.endTime,
        granularity: "day"
      });

      const totalCount = (response.data || []).reduce((sum, item) => {
        const count = item.tweetCount ?? item.tweet_count ?? 0;
        return sum + Number(count);
      }, 0);

      return { totalCount };
    } catch (error) {
      throw mapSdkError(error, input.searchMode === "full_archive" ? "counts_all" : "counts_recent", input.query);
    }
  }
}

function buildExclude(excludeReplies?: boolean, excludeRetweets?: boolean) {
  const exclude: string[] = [];
  if (excludeReplies) {
    exclude.push("replies");
  }
  if (excludeRetweets) {
    exclude.push("retweets");
  }
  return exclude.length ? exclude : undefined;
}

function normalizeMeta(meta: Record<string, unknown> | undefined) {
  if (!meta) {
    return undefined;
  }

  return {
    nextToken: typeof meta.nextToken === "string"
      ? meta.nextToken
      : typeof meta.next_token === "string"
        ? String(meta.next_token)
        : undefined,
    previousToken: typeof meta.previousToken === "string"
      ? meta.previousToken
      : typeof meta.previous_token === "string"
        ? String(meta.previous_token)
        : undefined,
    resultCount: typeof meta.resultCount === "number"
      ? meta.resultCount
      : typeof meta.result_count === "number"
        ? Number(meta.result_count)
        : undefined
  };
}

function buildMediaMap(media: XMediaLike[]) {
  const mediaByKey = new Map<string, string>();

  for (const item of media) {
    const key = item.mediaKey || item.media_key;
    const mediaUrl = item.url || item.previewImageUrl || item.preview_image_url || null;

    if (key && mediaUrl) {
      mediaByKey.set(String(key), String(mediaUrl));
    }
  }

  return mediaByKey;
}

function mapUser(user: XUserLike): AccountRecord {
  const metrics = (user.publicMetrics || user.public_metrics || {}) as Record<string, unknown>;

  return {
    userId: user.id,
    username: user.username || `user_${user.id}`,
    displayName: user.name || null,
    description: user.description || null,
    protected: !!user.protected,
    verified: !!user.verified,
    profileImageUrl: user.profileImageUrl || user.profile_image_url || null,
    followerCount: getNumber(metrics, "followersCount", "followers_count"),
    followingCount: getNumber(metrics, "followingCount", "following_count"),
    postCount: getNumber(metrics, "tweetCount", "tweet_count"),
    raw: user as unknown as Record<string, unknown>
  };
}

function mapTimelinePost(post: XPostLike, account: AccountRecord, mediaByKey: Map<string, string>): PostRecord {
  return mapPost(post, account, mediaByKey, "timeline", null);
}

function mapSearchPost(post: XPostLike, accountById: Map<string, AccountRecord>, mediaByKey: Map<string, string>, query: string): PostRecord {
  const authorId = post.authorId || post.author_id || "unknown";
  const account = accountById.get(authorId) || {
    userId: authorId,
    username: `user_${authorId}`,
    displayName: null,
    description: null,
    protected: false,
    verified: false,
    profileImageUrl: null,
    followerCount: null,
    followingCount: null,
    postCount: null,
    raw: { id: authorId }
  };

  return mapPost(post, account, mediaByKey, "search", query);
}

function mapPost(
  post: XPostLike,
  account: AccountRecord,
  mediaByKey: Map<string, string>,
  ingestSource: "timeline" | "search",
  matchedQuery: string | null
): PostRecord {
  const metrics = (post.publicMetrics || post.public_metrics || {}) as Record<string, unknown>;
  const referenced = post.referencedTweets || post.referenced_tweets || [];
  const referencedTypes = new Set(referenced.map(item => item.type));
  const mediaKeys = post.attachments?.mediaKeys || post.attachments?.media_keys || [];
  const mediaUrls = mediaKeys
    .map(mediaKey => mediaByKey.get(String(mediaKey)) || null)
    .filter((mediaUrl): mediaUrl is string => typeof mediaUrl === "string");

  return {
    postId: post.id,
    authorUserId: account.userId,
    username: account.username,
    textRaw: post.text || "",
    textNormalized: normalizeText(post.text || ""),
    mediaUrls,
    createdAt: post.createdAt || post.created_at || new Date().toISOString(),
    lang: post.lang || null,
    conversationId: post.conversationId || post.conversation_id || null,
    replyCount: getNumber(metrics, "replyCount", "reply_count"),
    likeCount: getNumber(metrics, "likeCount", "like_count"),
    repostCount: getNumber(metrics, "retweetCount", "retweet_count"),
    quoteCount: getNumber(metrics, "quoteCount", "quote_count"),
    bookmarkCount: getNumber(metrics, "bookmarkCount", "bookmark_count"),
    isReply: referencedTypes.has("replied_to"),
    isRepost: referencedTypes.has("retweeted"),
    isQuote: referencedTypes.has("quoted"),
    source: post.source || null,
    ingestSource,
    matchedQuery,
    raw: post as unknown as Record<string, unknown>,
    ingestedAt: new Date().toISOString()
  };
}

function mapSdkError(error: unknown, context: "timeline" | "user_lookup" | "search_recent" | "search_all" | "counts_recent" | "counts_all", label: string) {
  if (error instanceof XArchiveError) {
    return error;
  }

  if (error instanceof ApiError) {
    const detail = extractApiErrorMessage(error);

    if (error.status === 401) {
      return new XArchiveError(detail, "AUTH_ERROR", "Check the bearer token in .secrets/x.json.", 401);
    }

    if (context === "timeline" && error.status === 403) {
      return new ProtectedAccountError(label);
    }

    if ((context === "search_all" || context === "counts_all") && (error.status === 400 || error.status === 403 || error.status === 404)) {
      return new XArchiveError(
        detail,
        "FEATURE_NOT_AVAILABLE",
        "Full archive search may not be enabled for this X API account.",
        error.status
      );
    }

    if (error.status === 404) {
      return new AccountNotFoundError(detail);
    }

    if (error.status === 429) {
      return new XArchiveError(detail, "RATE_LIMITED", "Wait and retry after the rate limit window resets.", 429);
    }

    return new XArchiveError(detail, "UPSTREAM_ERROR", undefined, error.status);
  }

  if (error instanceof Error) {
    return new XArchiveError(error.message);
  }

  return new XArchiveError(String(error));
}

function extractApiErrorMessage(error: ApiError) {
  const first = Array.isArray(error.data?.errors) ? error.data.errors[0] : null;
  return first?.detail || first?.title || error.message || `X API request failed with ${error.status}`;
}

function getNumber(source: Record<string, unknown>, camelKey: string, snakeKey: string) {
  const value = source[camelKey] ?? source[snakeKey];
  return typeof value === "number" ? value : null;
}
