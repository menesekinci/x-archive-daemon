import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function detectProjectRoot() {
  let cursor = currentDir;

  while (true) {
    if (fs.existsSync(path.join(cursor, "package.json"))) {
      return cursor;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return path.resolve(currentDir, "..");
    }
    cursor = parent;
  }
}

const projectRoot = detectProjectRoot();

export function getProjectRoot() {
  return projectRoot;
}

export function getSecretsDir() {
  return path.join(projectRoot, ".secrets");
}

export function getDataDir() {
  return path.join(projectRoot, ".data");
}

export function getArtifactsDir() {
  return path.join(projectRoot, ".artifacts");
}

export function getModelsDir() {
  return path.join(projectRoot, ".models");
}

export function getAnalysisModelDir() {
  return path.join(getModelsDir(), "Xenova", "paraphrase-multilingual-MiniLM-L12-v2");
}

export function getDatabasePath() {
  return process.env.X_ARCHIVE_DB_PATH || path.join(getDataDir(), "x-archive.sqlite");
}
