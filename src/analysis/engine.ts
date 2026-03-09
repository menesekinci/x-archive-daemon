import { ANALYSIS_VERSION, EDUCATIONAL_SIGNAL_PHRASES, TECHNICAL_KEYWORDS, analysisLabels } from "./labels.js";
import { createTextEmbedder, type TextEmbedder } from "./model.js";
import type { AppConfig } from "../config.js";
import type {
  AnalysisLabelRecord,
  PostInsightRecord,
  PostRecord,
  SemanticSearchResult
} from "../provider-types.js";

export interface AnalysisCandidate extends PostRecord {
  insight: PostInsightRecord | null;
}

interface LabelEmbedding {
  label: AnalysisLabelRecord;
  vector: number[];
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function cosineSimilarity(left: number[], right: number[]) {
  let total = 0;
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    total += left[index]! * right[index]!;
  }
  return total;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(haystack: string, needles: string[]) {
  const normalized = haystack.toLowerCase();
  return needles.reduce((count, needle) => count + (normalized.includes(needle.toLowerCase()) ? 1 : 0), 0);
}

function buildLabelDocument(label: AnalysisLabelRecord) {
  return [
    label.titleTr,
    label.descriptionTr,
    ...label.aliases,
    ...label.seedExamples
  ].join("\n");
}

function computeSignalFlags(post: PostRecord) {
  const text = post.textRaw.trim();
  const tokens = tokenize(text);
  const technicalHits = TECHNICAL_KEYWORDS.filter(keyword => text.toLowerCase().includes(keyword)).length;
  const educationalPhraseHits = countMatches(text, EDUCATIONAL_SIGNAL_PHRASES);
  const mentionCount = (text.match(/@\w+/g) || []).length;
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  const lineBreaks = (text.match(/\n/g) || []).length;

  return {
    tokenCount: tokens.length,
    technicalHits,
    educationalPhraseHits,
    mentionCount,
    urlCount,
    lineBreaks,
    isOriginalPost: !post.isReply && !post.isRepost && !post.isQuote,
    isShortPost: text.length < 40,
    hasThreadLikeFormatting: lineBreaks > 0 || text.includes(":"),
    hasMedia: post.mediaUrls.length > 0
  };
}

function computeEducationalScore(post: PostRecord, topLabelScore: number, signalFlags: ReturnType<typeof computeSignalFlags>) {
  let score = 0.18 * topLabelScore;
  score += signalFlags.isOriginalPost ? 0.2 : -0.25;
  score += clamp(signalFlags.technicalHits / 6, 0, 0.2);
  score += clamp(signalFlags.educationalPhraseHits / 4, 0, 0.18);
  score += signalFlags.hasThreadLikeFormatting ? 0.08 : 0;
  score += signalFlags.hasMedia ? 0.02 : 0;

  if (signalFlags.tokenCount >= 25 && signalFlags.tokenCount <= 220) {
    score += 0.12;
  } else if (signalFlags.tokenCount < 12) {
    score -= 0.15;
  }

  if (signalFlags.mentionCount >= 3) {
    score -= 0.08;
  }
  if (signalFlags.urlCount >= 2) {
    score -= 0.04;
  }

  return clamp(score);
}

export class AnalysisEngine {
  private readonly embedder: TextEmbedder;
  private labelEmbeddingsPromise: Promise<LabelEmbedding[]> | null = null;

  constructor(embedder: TextEmbedder) {
    this.embedder = embedder;
  }

  async listLabels() {
    return analysisLabels;
  }

  async analyzePosts(posts: PostRecord[]) {
    if (posts.length === 0) {
      return [];
    }

    const [labelEmbeddings, vectors] = await Promise.all([
      this.getLabelEmbeddings(),
      this.embedder.embedTexts(posts.map(post => post.textRaw))
    ]);

    return posts.map((post, index) => {
      const vector = vectors[index] || [];
      const scoredLabels = labelEmbeddings
        .map(entry => ({
          label: entry.label.label,
          score: round(cosineSimilarity(vector, entry.vector))
        }))
        .sort((left, right) => right.score - left.score);

      const topScores = Object.fromEntries(scoredLabels.slice(0, 8).map(item => [item.label, item.score]));
      const matchedLabels = scoredLabels
        .filter((item, itemIndex) => item.score >= 0.2 || itemIndex < 3)
        .slice(0, 5)
        .map(item => item.label);

      const signalFlags = computeSignalFlags(post);
      const educationalScore = round(computeEducationalScore(post, scoredLabels[0]?.score || 0, signalFlags));

      return {
        postId: post.postId,
        analysisStatus: "completed" as const,
        analysisVersion: ANALYSIS_VERSION,
        embeddingVector: vector,
        isEducationalScore: educationalScore,
        isEducational: educationalScore >= 0.48,
        topicScores: topScores,
        matchedLabels,
        signalFlags,
        analyzedAt: new Date().toISOString(),
        errorMessage: null
      } satisfies PostInsightRecord;
    });
  }

  async semanticSearch(query: string, candidates: AnalysisCandidate[], input: {
    labels?: string[];
    educationalOnly: boolean;
    limit: number;
  }) {
    if (candidates.length === 0) {
      return [];
    }

    const [queryVector] = await this.embedder.embedTexts([query]);
    const labelFilter = new Set((input.labels || []).map(label => label.toLowerCase()));

    return candidates
      .filter(candidate => candidate.insight?.analysisStatus === "completed")
      .filter(candidate => !input.educationalOnly || candidate.insight?.isEducational)
      .map(candidate => {
        const insight = candidate.insight!;
        const matchedLabels = insight.matchedLabels || [];
        const labelMatchCount = labelFilter.size
          ? matchedLabels.filter(label => labelFilter.has(label.toLowerCase())).length
          : 0;

        if (labelFilter.size && labelMatchCount === 0) {
          return null;
        }

        const semanticScore = round(
          cosineSimilarity(queryVector, insight.embeddingVector || []) * 0.72
          + (insight.isEducationalScore || 0) * 0.2
          + (labelMatchCount > 0 ? 0.08 : 0)
        );

        return {
          postId: candidate.postId,
          username: candidate.username,
          createdAt: candidate.createdAt,
          textRaw: candidate.textRaw,
          mediaUrls: candidate.mediaUrls,
          matchedLabels,
          isEducational: !!insight.isEducational,
          isEducationalScore: insight.isEducationalScore || 0,
          semanticScore,
          topicScores: insight.topicScores || {}
        } satisfies SemanticSearchResult;
      })
      .filter((item): item is SemanticSearchResult => !!item)
      .sort((left, right) => right.semanticScore - left.semanticScore || right.isEducationalScore - left.isEducationalScore)
      .slice(0, input.limit);
  }

  private async getLabelEmbeddings() {
    if (!this.labelEmbeddingsPromise) {
      this.labelEmbeddingsPromise = (async () => {
        const vectors = await this.embedder.embedTexts(analysisLabels.map(buildLabelDocument));
        return analysisLabels.map((label, index) => ({
          label,
          vector: vectors[index] || []
        }));
      })();
    }

    return this.labelEmbeddingsPromise;
  }
}

export function createAnalysisEngine(config: AppConfig) {
  return new AnalysisEngine(createTextEmbedder(config));
}
