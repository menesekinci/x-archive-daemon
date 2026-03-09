import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import { loadConfig } from "../src/config.js";
import { createTempDir, writeJson } from "./helpers.js";

test("loadConfig reads x credentials from .secrets/x.json", () => {
  const tempDir = createTempDir("x-archive-config-");
  const credentialPath = path.join(tempDir, "x.json");
  writeJson(credentialPath, {
    authMode: "bearer_token",
    bearerToken: "test-token"
  });

  process.env.X_CREDENTIALS_FILE = credentialPath;
  process.env.X_ARCHIVE_DB_PATH = path.join(tempDir, "archive.sqlite");

  const config = loadConfig();
  assert.equal(config.xCredentials?.authMode, "bearer_token");
  assert.equal(config.xCredentials?.bearerToken, "test-token");
  assert.equal(config.databasePath, path.join(tempDir, "archive.sqlite"));

  delete process.env.X_CREDENTIALS_FILE;
  delete process.env.X_ARCHIVE_DB_PATH;
});
