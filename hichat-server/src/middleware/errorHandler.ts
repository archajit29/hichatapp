import { ErrorHandler, NotFoundHandler } from "hono";
import { AppError, NotFoundError } from "../core/errors";
import { logger } from "../core/logger";
import { config } from "../core/config";

/**
 * Formats a standardized error response object:
 * {
 *   success: false,
 *   error: {
 *     code: string,
 *     message: string,
 *     requestId: string
 *   }
 * }
 */
export function formatErrorResponse(
  code: string,
  message: string,
  requestId: string,
  statusCode: number,
  details?: any
) {
  const isProduction = config.isProduction || process.env.NODE_ENV === "production";

  const responsePayload: {
    success: false;
    error: {
      code: string;
      message: string;
      requestId: string;
      fields?: Record<string, string>;
      details?: any;
    };
  } = {
    success: false,
    error: {
      code,
      message,
      requestId,
    },
  };

  // Always attach validation error fields if present
  if (details && typeof details === "object") {
    if ("fields" in details && typeof details.fields === "object" && details.fields !== null) {
      responsePayload.error.fields = details.fields;
    } else if (code === "VALIDATION_ERROR" && !Array.isArray(details) && !("cause" in details)) {
      responsePayload.error.fields = details;
    }
  }

  // Only attach non-sensitive details in development mode if provided and not already exposed as fields
  if (!isProduction && details && !responsePayload.error.fields) {
    responsePayload.error.details = details;
  }

  return responsePayload;
}

/**
 * Centralized Hono Error Handler
 */
export const centralizedErrorHandler: ErrorHandler = (err, c) => {
  const reqLogger = c.get("logger") || logger;
  const requestId = c.get("requestId") || `req_${Date.now().toString(36)}`;
  const isProduction = config.isProduction || process.env.NODE_ENV === "production";

  let statusCode = 500;
  let errorCode = "INTERNAL_SERVER_ERROR";
  let errorMessage = "An unexpected internal server error occurred";
  let details: any = undefined;

  // 1. Handle Known AppError Subclasses
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    errorMessage = err.message;
    details = (err as any).fields ? { fields: (err as any).fields } : err.details;
  }
  // 2. Handle Zod Validation Errors
  else if (err.name === "ZodError" || "issues" in (err as any)) {
    statusCode = 400;
    errorCode = "VALIDATION_ERROR";
    errorMessage = "Validation failed";
    const fields: Record<string, string> = {};
    for (const issue of (err as any).issues || []) {
      const path = issue.path.join(".") || "root";
      if (!fields[path]) {
        fields[path] = issue.message;
      }
    }
    details = { fields };
  }
  // 3. Handle JSON Body Syntax Errors
  else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    errorCode = "VALIDATION_ERROR";
    errorMessage = "Malformed JSON payload in request body";
  }
  // 3. Handle SQLite Database Errors
  else if (err.name === "SQLiteError" || err.message?.includes("SQLiteError")) {
    if (err.message?.includes("UNIQUE constraint failed: users.username")) {
      statusCode = 409;
      errorCode = "CONFLICT_ERROR";
      errorMessage = "Username is already taken";
    } else if (err.message?.includes("UNIQUE constraint failed: users.email")) {
      statusCode = 409;
      errorCode = "CONFLICT_ERROR";
      errorMessage = "Email is already registered";
    } else if (err.message?.includes("UNIQUE constraint failed")) {
      statusCode = 409;
      errorCode = "CONFLICT_ERROR";
      errorMessage = "A database unique constraint was violated";
    } else {
      statusCode = 500;
      errorCode = "DATABASE_ERROR";
      errorMessage = isProduction ? "Database operation failed" : err.message;
    }
  }
  // 4. Handle Generic Errors
  else {
    statusCode = (err as any).status || (err as any).statusCode || 500;
    errorCode = (err as any).code || "INTERNAL_SERVER_ERROR";
    errorMessage = isProduction && statusCode >= 500
      ? "An unexpected internal server error occurred"
      : err.message || "Internal server error";
  }

  // Structured Logging based on severity with cause chain tracking
  const causeChain = typeof (err as any)?.getCauseChain === "function"
    ? (err as any).getCauseChain()
    : undefined;
  const rootCause = typeof (err as any)?.getRootCause === "function"
    ? (err as any).getRootCause()
    : (err as any)?.cause;

  const logData: Record<string, any> = {
    err,
    stack: err.stack,
    errorCode,
    statusCode,
    requestId,
    method: c.req.method,
    path: c.req.path,
  };

  if (causeChain && causeChain.length > 0) {
    logData.causeChain = causeChain;
  }
  if (rootCause) {
    logData.rootCause = rootCause instanceof Error
      ? { name: rootCause.name, message: rootCause.message, stack: rootCause.stack }
      : rootCause;
  }

  if (statusCode >= 500) {
    reqLogger.error(logData, `💥 [${errorCode}] ${c.req.method} ${c.req.path} (${statusCode}): ${errorMessage}`);
  } else if (statusCode >= 400) {
    reqLogger.warn(logData, `⚠️ [${errorCode}] ${c.req.method} ${c.req.path} (${statusCode}): ${errorMessage}`);
  } else {
    reqLogger.info(logData, `[${errorCode}] ${c.req.method} ${c.req.path} (${statusCode}): ${errorMessage}`);
  }

  return c.json(
    formatErrorResponse(errorCode, errorMessage, requestId, statusCode, details),
    statusCode as any
  );
};

/**
 * Centralized 404 Not Found Handler
 */
export const centralizedNotFoundHandler: NotFoundHandler = (c) => {
  const reqLogger = c.get("logger") || logger;
  const requestId = c.get("requestId") || `req_${Date.now().toString(36)}`;
  const notFoundErr = new NotFoundError(`Cannot ${c.req.method} ${c.req.path}`);

  reqLogger.warn(
    {
      errorCode: notFoundErr.code,
      statusCode: notFoundErr.statusCode,
      requestId,
      method: c.req.method,
      path: c.req.path,
    },
    `🔍 Route Not Found: ${c.req.method} ${c.req.path}`
  );

  return c.json(
    formatErrorResponse(notFoundErr.code, notFoundErr.message, requestId, notFoundErr.statusCode),
    404
  );
};
