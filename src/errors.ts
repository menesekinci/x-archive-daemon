export class XArchiveError extends Error {
  code: string;
  suggestion?: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code = "UPSTREAM_ERROR",
    suggestion?: string,
    statusCode = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "XArchiveError";
    this.code = code;
    this.suggestion = suggestion;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ProviderNotConfiguredError extends XArchiveError {
  constructor() {
    super(
      "x provider is not configured.",
      "PROVIDER_NOT_CONFIGURED",
      "Place X credentials in .secrets/x.json and restart the daemon.",
      400
    );
  }
}

export class ToolNotFoundError extends XArchiveError {
  constructor(tool: string) {
    super(
      `Tool not found: ${tool}`,
      "TOOL_NOT_FOUND",
      "Inspect GET /tools to see the available tool names.",
      404
    );
  }
}

export class AccountNotFoundError extends XArchiveError {
  constructor(message = "Account not found.") {
    super(message, "NOT_FOUND", "Check the username or userId and try again.", 404);
  }
}

export class AccountNotArchivedError extends XArchiveError {
  constructor() {
    super(
      "Account has not been archived yet.",
      "ACCOUNT_NOT_ARCHIVED",
      "Run ingest.accounts.backfill first.",
      400
    );
  }
}

export class ProtectedAccountError extends XArchiveError {
  constructor(username: string) {
    super(
      `Account is protected and cannot be archived with the current credentials: ${username}`,
      "PROTECTED_ACCOUNT",
      "Use a different public account or credentials with access to that account.",
      403
    );
  }
}

export class DaemonUnavailableError extends XArchiveError {
  constructor(message = "X archive daemon is unavailable.") {
    super(
      message,
      "DAEMON_UNAVAILABLE",
      "Start the x-archive daemon and retry the MCP tool call.",
      503
    );
  }
}

export class InvalidDaemonResponseError extends XArchiveError {
  constructor(message = "Daemon returned an invalid response.") {
    super(
      message,
      "INVALID_DAEMON_RESPONSE",
      "Check the daemon logs and verify that /health, /tools, and /invoke return valid JSON.",
      502
    );
  }
}
