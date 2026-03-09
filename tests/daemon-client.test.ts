import test from "node:test";
import assert from "node:assert/strict";

import {
  getDaemonHealth,
  getDaemonTools,
  invokeDaemonTool
} from "../src/daemon-client.js";

test("daemon-client reads health, tools and invoke payloads", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ready: true, status: "ready" }), { status: 200 });
    }
    if (url.pathname === "/tools") {
      return new Response(JSON.stringify({
        tools: [{ name: "sources.accounts.resolve", description: "resolve", inputSchema: {}, readOnly: true, riskLevel: "safe-read", requiresConfirmation: false, riskSummary: "read" }]
      }), { status: 200 });
    }
    if (url.pathname === "/invoke" && init?.method === "POST") {
      return new Response(JSON.stringify({
        ok: true,
        tool: "sources.accounts.resolve",
        result: { account: { username: "sampleauthor" } }
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  }) as typeof fetch;

  try {
    const health = await getDaemonHealth({ baseUrl: "http://127.0.0.1:9999" });
    const tools = await getDaemonTools({ baseUrl: "http://127.0.0.1:9999" });
    const invoke = await invokeDaemonTool("sources.accounts.resolve", { username: "sampleauthor" }, { baseUrl: "http://127.0.0.1:9999" });

    assert.equal(health.status, "ready");
    assert.equal(tools[0]?.name, "sources.accounts.resolve");
    assert.equal((invoke.result.account as { username: string }).username, "sampleauthor");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("daemon-client returns DAEMON_UNAVAILABLE when fetch fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("connect ECONNREFUSED");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => getDaemonHealth({ baseUrl: "http://127.0.0.1:9999" }),
      error => {
        assert.equal((error as { code?: string }).code, "DAEMON_UNAVAILABLE");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
