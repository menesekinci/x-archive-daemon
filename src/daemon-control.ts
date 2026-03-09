import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

import { getDaemonBaseUrl, getDaemonHealth } from "./daemon-client.js";
import { XArchiveError } from "./errors.js";
import { getProjectRoot } from "./paths.js";

const DAEMON_START_TIMEOUT_MS = 5000;
const DAEMON_POLL_INTERVAL_MS = 250;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDaemonEntrypointPath() {
  return path.join(getProjectRoot(), "build", "src", "daemon.js");
}

function buildDaemonEnv() {
  const daemonUrl = new URL(getDaemonBaseUrl());

  return {
    ...process.env,
    X_ARCHIVE_DAEMON_URL: daemonUrl.toString(),
    MOBILE_CONSOLE_DAEMON_HOST: daemonUrl.hostname,
    MOBILE_CONSOLE_DAEMON_PORT: daemonUrl.port || (daemonUrl.protocol === "https:" ? "443" : "80")
  };
}

export async function startDaemonProcess() {
  try {
    const health = await getDaemonHealth();
    return {
      started: false,
      alreadyRunning: true,
      daemonUrl: getDaemonBaseUrl(),
      health
    };
  } catch {
    // Daemon is not running; continue with start flow.
  }

  const entrypoint = getDaemonEntrypointPath();
  if (!fs.existsSync(entrypoint)) {
    throw new XArchiveError(
      "Daemon build output was not found.",
      "DAEMON_START_FAILED",
      "Run `npm run build` in x-archive-daemon before using system.daemon.start.",
      500
    );
  }

  const child = spawn(process.execPath, [entrypoint], {
    cwd: getProjectRoot(),
    detached: true,
    stdio: "ignore",
    env: buildDaemonEnv()
  });
  child.unref();

  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    await sleep(DAEMON_POLL_INTERVAL_MS);

    try {
      const health = await getDaemonHealth();
      return {
        started: true,
        alreadyRunning: false,
        daemonUrl: getDaemonBaseUrl(),
        pid: child.pid,
        health
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new XArchiveError(
    lastError instanceof Error ? lastError.message : "Daemon did not become ready in time.",
    "DAEMON_START_FAILED",
    "Check daemon logs or run `npm run daemon:start` manually.",
    500
  );
}
