import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "./mcp.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch(error => {
  console.error("[X Archive MCP] Failed to start:", error);
  process.exit(1);
});
