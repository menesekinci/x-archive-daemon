import test from "node:test";
import assert from "node:assert/strict";

import { createDaemonServer } from "../src/daemon/server.js";
import { toolRegistry } from "../src/tool-registry.js";

test("daemon exposes health, tools and invoke routes", async () => {
  const daemon = createDaemonServer({
    port: 0,
    bootstrapRuntime: async () => {},
    getHealthSnapshot: async () => ({ ready: true, status: "ready" }),
    invokeTool: async (tool, input) => ({ tool, input })
  });

  await daemon.start();
  const address = daemon.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address");
  }

  const baseUrl = `http://${daemon.host}:${address.port}`;
  const healthResponse = await fetch(`${baseUrl}/health`);
  const toolsResponse = await fetch(`${baseUrl}/tools`);
  const invokeResponse = await fetch(`${baseUrl}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tool: "sources.accounts.resolve",
      input: { username: "XDevelopers" }
    })
  });

  assert.equal((await healthResponse.json()).status, "ready");
  assert.equal((await toolsResponse.json()).tools.length, toolRegistry.length);
  assert.equal((await invokeResponse.json()).ok, true);

  await daemon.close();
});
