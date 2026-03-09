import {
  DaemonUnavailableError,
  InvalidDaemonResponseError,
  XArchiveError
} from "./errors.js";

export interface DaemonInvokeSuccess {
  ok: true;
  tool: string;
  result: Record<string, unknown>;
  meta?: Record<string, unknown>;
  requestId?: string;
}

export interface DaemonInvokeFailure {
  ok: false;
  tool: string;
  error: {
    code: string;
    message: string;
    suggestion?: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export interface DaemonToolDescriptor {
  name: string;
  group: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  riskLevel: string;
  requiresConfirmation: boolean;
  riskSummary: string;
  exampleInput?: Record<string, unknown>;
}

interface RequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_DAEMON_URL = process.env.X_ARCHIVE_DAEMON_URL || "http://127.0.0.1:3200";
const DEFAULT_TIMEOUT_MS = 30000;

function getBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_DAEMON_URL).replace(/\/$/, "");
}

export function getDaemonBaseUrl(baseUrl?: string) {
  return getBaseUrl(baseUrl);
}

async function requestJson<T>(route: string, init: RequestInit, options: RequestOptions): Promise<T> {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const url = `${getBaseUrl(options.baseUrl)}${route}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new DaemonUnavailableError(error instanceof Error ? error.message : String(error));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new InvalidDaemonResponseError(error instanceof Error ? error.message : String(error));
  }

  return payload as T;
}

function isInvokeFailurePayload(payload: DaemonInvokeSuccess | DaemonInvokeFailure): payload is DaemonInvokeFailure {
  return payload.ok === false;
}

function throwDaemonPayloadError(payload: DaemonInvokeFailure["error"]) {
  throw new XArchiveError(payload.message, payload.code, payload.suggestion, 400, payload.details);
}

export async function getDaemonHealth(options: RequestOptions = {}) {
  return requestJson<Record<string, unknown>>("/health", {
    method: "GET"
  }, options);
}

export async function getDaemonTools(options: RequestOptions = {}) {
  const payload = await requestJson<{ tools: DaemonToolDescriptor[] }>("/tools", {
    method: "GET"
  }, options);

  if (!payload || !Array.isArray(payload.tools)) {
    throw new InvalidDaemonResponseError("Daemon returned an invalid tools payload.");
  }

  return payload.tools;
}

export async function invokeDaemonTool(
  tool: string,
  input: Record<string, unknown>,
  options: RequestOptions & { requestId?: string } = {}
): Promise<DaemonInvokeSuccess> {
  const payload = await requestJson<DaemonInvokeSuccess | DaemonInvokeFailure>("/invoke", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tool,
      input,
      requestId: options.requestId
    })
  }, options);

  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    throw new InvalidDaemonResponseError("Daemon returned an invalid invoke payload.");
  }

  if (isInvokeFailurePayload(payload)) {
    throwDaemonPayloadError(payload.error);
  }

  return payload as DaemonInvokeSuccess;
}
