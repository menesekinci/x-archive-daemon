import { ZodError } from "zod";

import { XArchiveError } from "./errors.js";

export function serializeToolError(error: unknown) {
  if (error instanceof XArchiveError) {
    return {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      details: error.details
    };
  }

  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: error.issues.map(issue => issue.message).join("; "),
      suggestion: "Provide input that matches the documented schema."
    };
  }

  if (error instanceof Error) {
    return {
      code: "UPSTREAM_ERROR",
      message: error.message
    };
  }

  return {
    code: "UPSTREAM_ERROR",
    message: String(error)
  };
}

export function toErrorResult(error: unknown) {
  const payload = serializeToolError(error);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: payload.message,
        code: payload.code,
        suggestion: payload.suggestion,
        details: payload.details
      }, null, 2)
    }],
    isError: true
  };
}
