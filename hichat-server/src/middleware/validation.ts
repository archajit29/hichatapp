import { MiddlewareHandler } from "hono";
import { z } from "zod";
import { Socket } from "socket.io";
import { ValidationError } from "../core/errors";
import { logger } from "../core/logger";

/**
 * Format Zod issues into a key-value field map:
 * {
 *   "email": "Invalid email format",
 *   "password": "Minimum length is 8"
 * }
 */
export function formatZodIssues(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    if (!fields[path]) {
      fields[path] = issue.message;
    }
  }
  return fields;
}

/**
 * Hono Middleware: Validate Request JSON Body against a Zod Schema
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler {
  return async (c, next) => {
    let rawBody: any = {};
    try {
      rawBody = await c.req.json();
    } catch (_) {
      throw new ValidationError("Malformed JSON payload in request body", {
        body: "Invalid JSON format",
      });
    }

    const result = schema.safeParse(rawBody);
    if (!result.success) {
      const fields = formatZodIssues(result.error);
      throw new ValidationError("Validation failed", fields);
    }

    c.set("validJson", result.data);
    await next();
  };
}

/**
 * Hono Middleware: Validate Request Query Parameters against a Zod Schema
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler {
  return async (c, next) => {
    const query = c.req.query();
    const result = schema.safeParse(query);
    if (!result.success) {
      const fields = formatZodIssues(result.error);
      throw new ValidationError("Query parameter validation failed", fields);
    }

    c.set("validQuery", result.data);
    await next();
  };
}

/**
 * Hono Middleware: Validate Request Path Parameters against a Zod Schema
 */
export function validateParams<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler {
  return async (c, next) => {
    const params = c.req.param();
    const result = schema.safeParse(params);
    if (!result.success) {
      const fields = formatZodIssues(result.error);
      throw new ValidationError("Path parameter validation failed", fields);
    }

    c.set("validParams", result.data);
    await next();
  };
}

export interface SocketValidationResult<T> {
  success: boolean;
  data?: T;
  fields?: Record<string, string>;
  message?: string;
}

/**
 * Real-time Socket.IO Payload Validator:
 * Validates payload against Zod schema. If invalid, emits standardized 'validation_error' event
 * and returns { success: false }, preventing handler execution and crashes.
 */
export function validateSocket<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
  socket?: Socket,
  callback?: (errOrRes: any) => void
): SocketValidationResult<z.infer<T>> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const fields = formatZodIssues(result.error);
    const errorMessage = "Invalid payload";

    const errorPayload = {
      event: "validation_error",
      code: "VALIDATION_ERROR",
      message: errorMessage,
      fields,
    };

    if (socket) {
      socket.emit("validation_error", errorPayload);
      const sockLogger = socket.data?.logger || logger;
      sockLogger.warn(
        {
          socketId: socket.id,
          userId: socket.data?.userId,
          fields,
        },
        `⚠️ Socket validation error: ${errorMessage}`
      );
    }

    if (typeof callback === "function") {
      callback({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: errorMessage,
          fields,
        },
      });
    }

    return {
      success: false,
      fields,
      message: errorMessage,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
