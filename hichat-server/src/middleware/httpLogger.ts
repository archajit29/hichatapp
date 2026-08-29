import { MiddlewareHandler } from "hono";
import { logger, getScopedLogger } from "../core/logger";
import { AuthService } from "../services/authService";
import { requestContext } from "../core/context";
import { getClientIp } from "./security";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
    logger: ReturnType<typeof getScopedLogger>;
    userId?: string;
  }
}

/**
 * Production HTTP Request Logging Middleware
 * - Injects unique Request ID (from header or auto-generated)
 * - Sets X-Request-Id response header
 * - Measures response time in milliseconds
 * - Extracts client IP, user agent, and authenticated user ID
 * - Emits structured Pino logs
 */
export const httpLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const requestId =
      c.req.header("x-request-id") ||
      c.req.header("x-correlation-id") ||
      `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    c.header("X-Request-Id", requestId);
    c.set("requestId", requestId);

    // Try extracting authenticated user ID from Authorization header
    let authUserId: string | undefined;
    const authHeader = c.req.header("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = AuthService.verifyToken(token);
        if (decoded?.id) {
          authUserId = decoded.id;
          c.set("userId", decoded.id);
        }
      } catch (_) {
        // Token invalid or unverified, ignore here as auth middleware will handle
      }
    }

    const reqLogger = getScopedLogger({
      requestId,
      userId: authUserId,
      module: "http"
    });
    c.set("logger", reqLogger);
    const clientIp = getClientIp(c);
    const userAgent = c.req.header("user-agent") || "unknown";

    try {
      await requestContext.run({ requestId, userId: authUserId, module: "http" }, async () => {
        await next();
      });
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      reqLogger.error(
        {
          err,
          stack: err.stack,
          method: c.req.method,
          path: c.req.path,
          statusCode: 500,
          durationMs,
          ip: clientIp,
          userAgent,
          userId: c.get("userId") || authUserId,
        },
        `HTTP ${c.req.method} ${c.req.path} 500 - ${durationMs}ms (Internal Error)`
      );
      throw err;
    }

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const statusCode = c.res.status;
    const logData = {
      requestId,
      method: c.req.method,
      path: c.req.path,
      statusCode,
      durationMs,
      ip: clientIp,
      userAgent,
      userId: c.get("userId") || authUserId,
    };

    const msg = `HTTP ${c.req.method} ${c.req.path} ${statusCode} - ${durationMs}ms`;

    if (statusCode >= 500) {
      reqLogger.error(logData, msg);
    } else if (statusCode >= 400) {
      reqLogger.warn(logData, msg);
    } else {
      reqLogger.info(logData, msg);
    }
  };
};
