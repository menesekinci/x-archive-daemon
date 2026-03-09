import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

import { executeRegisteredTool } from "../tool-executors.js";
import { getRuntime, getRuntimeSnapshot, shutdownRuntime } from "../runtime.js";
import { getToolDefinition, listToolCatalog, toolRegistry, type ToolDefinition } from "../tool-registry.js";
import { ToolNotFoundError, XArchiveError } from "../errors.js";
import { serializeToolError } from "../tool-response.js";

interface DaemonServerOptions {
  host?: string;
  port?: number;
  toolRegistry?: ToolDefinition[];
  bootstrapRuntime?: () => Promise<void>;
  getHealthSnapshot?: () => Promise<Record<string, unknown>>;
  invokeTool?: (toolName: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  shutdownRuntimeOnClose?: boolean;
}

interface InvokeRequestBody {
  tool?: string;
  input?: Record<string, unknown>;
  requestId?: string;
}

function readPackageVersion() {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");

  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || "unknown";
  } catch {
    return "unknown";
  }
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new XArchiveError(
      "Request body must be valid JSON.",
      "VALIDATION_ERROR",
      "POST /invoke with a valid JSON object."
    );
  }
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload, null, 2));
}

function createDefaultHealthSnapshot(startedAt: number) {
  const version = readPackageVersion();

  return async () => {
    const snapshot = await getRuntimeSnapshot();
    return {
      ...snapshot,
      pid: process.pid,
      uptimeMs: Date.now() - startedAt,
      toolCount: toolRegistry.length,
      version
    };
  };
}

export function createDaemonServer(options: DaemonServerOptions = {}) {
  const envPort = Number(process.env.MOBILE_CONSOLE_DAEMON_PORT || process.env.PORT || 3000);
  const host = options.host ?? process.env.MOBILE_CONSOLE_DAEMON_HOST ?? "127.0.0.1";
  const port = options.port ?? (Number.isFinite(envPort) ? envPort : 3000);
  const startedAt = Date.now();
  const registry = options.toolRegistry || toolRegistry;
  const bootstrapRuntime = options.bootstrapRuntime || (async () => {
    await getRuntime();
  });
  const getHealthSnapshot = options.getHealthSnapshot || createDefaultHealthSnapshot(startedAt);
  const invokeTool = options.invokeTool || ((toolName: string, input: Record<string, unknown>) => {
    return executeRegisteredTool(toolName, input, registry);
  });
  const shutdownRuntimeOnClose = options.shutdownRuntimeOnClose !== false;

  const server = http.createServer(async (request, response) => {
    const method = request.method || "GET";
    const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);

    try {
      if (method === "GET" && requestUrl.pathname === "/health") {
        writeJson(response, 200, await getHealthSnapshot());
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/tools") {
        writeJson(response, 200, {
          tools: listToolCatalog(registry)
        });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/invoke") {
        const body = await readJsonBody(request) as InvokeRequestBody;

        if (!body || typeof body.tool !== "string") {
          throw new XArchiveError(
            "Request body must include a string 'tool' field.",
            "VALIDATION_ERROR",
            "POST /invoke with { tool, input }."
          );
        }

        const definition = getToolDefinition(body.tool, registry);
        if (!definition) {
          throw new ToolNotFoundError(body.tool);
        }

        try {
          const result = await invokeTool(body.tool, body.input || {});
          writeJson(response, 200, {
            ok: true,
            tool: body.tool,
            requestId: body.requestId,
            result
          });
        } catch (error) {
          const serialized = serializeToolError(error);
          const statusCode = error instanceof XArchiveError ? error.statusCode : 400;
          writeJson(response, statusCode, {
            ok: false,
            tool: body.tool,
            requestId: body.requestId,
            error: serialized
          });
        }
        return;
      }

      writeJson(response, 404, {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Route not found: ${method} ${requestUrl.pathname}`
        }
      });
    } catch (error) {
      const serialized = serializeToolError(error);
      const statusCode = error instanceof XArchiveError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        ok: false,
        error: serialized
      });
    }
  });

  return {
    host,
    port,
    server,
    async start() {
      await bootstrapRuntime();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      if (shutdownRuntimeOnClose) {
        await shutdownRuntime();
      }
    }
  };
}
