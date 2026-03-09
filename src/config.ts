import * as fs from "node:fs";
import * as path from "node:path";

import { z } from "zod";

import { getAnalysisModelDir, getDatabasePath, getProjectRoot, getSecretsDir } from "./paths.js";

const XCredentialsSchema = z.object({
  authMode: z.literal("bearer_token"),
  bearerToken: z.string().min(1)
});

export type XCredentials = z.infer<typeof XCredentialsSchema>;

export interface AppConfig {
  projectRoot: string;
  secretsDir: string;
  databasePath: string;
  xCredentialsPath: string;
  xCredentials: XCredentials | null;
  analysisModelPath: string;
  useFakeAnalysisModel: boolean;
}

function readJsonIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

export function loadConfig(): AppConfig {
  const secretsDir = getSecretsDir();
  const xCredentialsPath = process.env.X_CREDENTIALS_FILE || path.join(secretsDir, "x.json");
  const xRaw = readJsonIfExists(xCredentialsPath);

  return {
    projectRoot: getProjectRoot(),
    secretsDir,
    databasePath: getDatabasePath(),
    xCredentialsPath,
    xCredentials: xRaw ? XCredentialsSchema.parse(xRaw) : null
    ,
    analysisModelPath: process.env.X_ARCHIVE_ANALYSIS_MODEL_PATH || getAnalysisModelDir(),
    useFakeAnalysisModel: process.env.X_ARCHIVE_FAKE_ANALYSIS_MODEL === "1"
  };
}
