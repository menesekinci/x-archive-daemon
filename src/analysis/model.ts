import * as fs from "node:fs";
import * as path from "node:path";

import type { AppConfig } from "../config.js";

export interface TextEmbedder {
  embedTexts(texts: string[]): Promise<number[][]>;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }
  return vector.map(value => value / magnitude);
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export class HashingEmbedder implements TextEmbedder {
  constructor(private readonly dimensions = 384) {}

  async embedTexts(texts: string[]) {
    return texts.map(text => {
      const vector = new Array<number>(this.dimensions).fill(0);
      const tokens = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .split(/\s+/)
        .filter(Boolean);

      for (const token of tokens) {
        const bucket = hashToken(token) % this.dimensions;
        vector[bucket] += 1;
      }

      return normalizeVector(vector);
    });
  }
}

export class TransformersJsEmbedder implements TextEmbedder {
  private extractorPromise: Promise<any>;

  constructor(private readonly modelPath: string) {
    this.extractorPromise = this.createExtractor();
  }

  private async createExtractor() {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = path.dirname(path.dirname(this.modelPath));

    return pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2", {
      local_files_only: true
    });
  }

  async embedTexts(texts: string[]) {
    const extractor = await this.extractorPromise;
    const raw = await extractor(texts, {
      pooling: "mean",
      normalize: true
    });
    const rows = raw.tolist();

    if (Array.isArray(rows) && Array.isArray(rows[0])) {
      return rows as number[][];
    }

    return [rows as number[]];
  }
}

export function createTextEmbedder(config: AppConfig): TextEmbedder {
  if (config.useFakeAnalysisModel) {
    return new HashingEmbedder();
  }

  if (!fs.existsSync(config.analysisModelPath)) {
    throw new Error(`Local analysis model not found at ${config.analysisModelPath}`);
  }

  return new TransformersJsEmbedder(config.analysisModelPath);
}
