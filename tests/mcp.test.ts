import test from "node:test";
import assert from "node:assert/strict";

import { createMcpServer } from "../src/mcp.js";
import { toolRegistry } from "../src/tool-registry.js";

test("mcp registers all tools from registry", () => {
  const server = createMcpServer() as unknown as { _registeredTools: Record<string, unknown> };
  const registeredToolNames = Object.keys(server._registeredTools);

  assert.equal(registeredToolNames.length, toolRegistry.length + 1);
  assert.deepEqual(
    registeredToolNames.sort(),
    [...toolRegistry.map(tool => tool.name), "system.daemon.start"].sort()
  );
});

test("mcp tool handler returns daemon result as text json", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as { tool: string };
    return new Response(JSON.stringify({
      ok: true,
      tool: body.tool,
      result: {
        account: {
          username: "sampleauthor"
        }
      }
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const server = createMcpServer() as unknown as {
      _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }>;
    };
    const result = await server._registeredTools["sources.accounts.resolve"].handler({
      username: "sampleauthor"
    });

    const payload = JSON.parse(result.content[0]?.text || "{}") as { account: { username: string } };
    assert.equal(payload.account.username, "sampleauthor");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mcp tool handler returns DAEMON_UNAVAILABLE when daemon is down", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("connect ECONNREFUSED");
  }) as typeof fetch;

  try {
    const server = createMcpServer() as unknown as {
      _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>;
    };
    const result = await server._registeredTools["sources.accounts.resolve"].handler({
      username: "sampleauthor"
    });
    const payload = JSON.parse(result.content[0]?.text || "{}") as { code: string };

    assert.equal(result.isError, true);
    assert.equal(payload.code, "DAEMON_UNAVAILABLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("system.daemon.start returns local start result", async () => {
  const server = createMcpServer({
    startDaemon: async () => ({
      started: true,
      alreadyRunning: false,
      daemonUrl: "http://127.0.0.1:3200",
      pid: 12345,
      health: { ready: true, status: "ready" }
    })
  }) as unknown as {
    _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }>;
  };

  const result = await server._registeredTools["system.daemon.start"].handler({});
  const payload = JSON.parse(result.content[0]?.text || "{}") as { started: boolean; pid: number };

  assert.equal(payload.started, true);
  assert.equal(payload.pid, 12345);
});
