import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { invokeDaemonTool } from "./daemon-client.js";
import { startDaemonProcess } from "./daemon-control.js";
import { toErrorResult } from "./tool-response.js";
import { toolRegistry } from "./tool-registry.js";

interface McpServerOptions {
  invokeTool?: typeof invokeDaemonTool;
  startDaemon?: typeof startDaemonProcess;
}

export function createMcpServer(options: McpServerOptions = {}) {
  const server = new McpServer({
    name: "X Archive MCP",
    version: "0.1.0"
  });
  const invokeTool = options.invokeTool || invokeDaemonTool;
  const startDaemon = options.startDaemon || startDaemonProcess;

  server.registerTool(
    "system.daemon.start",
    {
      description: "Starts the local x-archive daemon process if it is not already running."
    },
    async () => {
      try {
        const result = await startDaemon();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  for (const tool of toolRegistry) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema
      },
      async input => {
        try {
          const parsedInput = await tool.inputSchema.parseAsync(input);
          const response = await invokeTool(tool.name, parsedInput);

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                ...response.result,
                ...(response.meta || {})
              }, null, 2)
            }]
          };
        } catch (error) {
          return toErrorResult(error);
        }
      }
    );
  }

  return server;
}
