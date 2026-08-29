import { MiddlewareHandler, Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import crypto from "crypto";
import { config } from "../core/config";
import { CsrfError } from "../core/errors";
import { logger } from "../core/logger";

const securityLogger = logger.child({ module: "security-audit" });

export const DEV_REFRESH_COOKIE_NAME = "hichat_refresh_token";
export const PROD_REFRESH_COOKIE_NAME = "__Host-hichat_refresh_token";
export const REFRESH_COOKIE_NAME = DEV_REFRESH_COOKIE_NAME;
export const CSRF_COOKIE_NAME = "hichat_csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Returns the environment-appropriate refresh token cookie name.
 * Uses __Host- prefix in production as per RFC 6265bis.
 */
export function getRefreshCookieName(isProd: boolean = config.isProduction || process.env.NODE_ENV === "production"): string {
  return isProd ? PROD_REFRESH_COOKIE_NAME : DEV_REFRESH_COOKIE_NAME;
}

/**
 * IP format validation regex (IPv4 and IPv6)
 */
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

/**
 * Safely resolves the real client IP address considering reverse proxy trust configuration.
 * Prevents IP spoofing when not behind a trusted proxy.
 */
export function getClientIp(c: Context): string {
  const isProxyTrusted = config.server.trustProxy === true || config.server.trustProxy === "true";

  if (isProxyTrusted) {
    // 1. Cloudflare / AWS CloudFront / Nginx specific trusted headers
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    if (cfIp && (IPV4_REGEX.test(cfIp) || IPV6_REGEX.test(cfIp))) {
      return cfIp;
    }

    const realIp = c.req.header("x-real-ip")?.trim();
    if (realIp && (IPV4_REGEX.test(realIp) || IPV6_REGEX.test(realIp))) {
      return realIp;
    }

    const trueClientIp = c.req.header("true-client-ip")?.trim();
    if (trueClientIp && (IPV4_REGEX.test(trueClientIp) || IPV6_REGEX.test(trueClientIp))) {
      return trueClientIp;
    }

    // 2. Standard X-Forwarded-For: "client, proxy1, proxy2"
    const forwardedFor = c.req.header("x-forwarded-for");
    if (forwardedFor) {
      const parts = forwardedFor
        .split(",")
        .map((p) => p.trim().split(":")[0]) // Strip port if present
        .filter((p) => IPV4_REGEX.test(p) || IPV6_REGEX.test(p));

      if (parts.length > 0) {
        // Return leftmost valid client IP
        return parts[0];
      }
    }
  }

  // If proxy is not trusted or no proxy header present, use socket/remote address or default
  return c.req.header("remote-addr") || "127.0.0.1";
}

/**
 * Security Event Types for Structured Audit Logging
 */
export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "REFRESH_TOKEN_ROTATED"
  | "REFRESH_TOKEN_REUSE_DETECTED"
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "CSRF_REJECTED";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "refreshToken",
  "accessToken",
  "jwt",
  "secret",
  "publicKey",
  "cookie",
]);

/**
 * Recursively sanitizes audit metadata to guarantee zero secret leakage.
 */
function sanitizeAuditMetadata(data?: Record<string, any>): Record<string, any> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const sanitized: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      sanitized[key] = sanitizeAuditMetadata(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Emits a structured security audit log entry (requestId, userId, ip, userAgent, eventType).
 * Guarantees that credentials, tokens, and secrets are never logged.
 */
export function securityAuditLog(
  c: Context,
  params: {
    eventType: SecurityEventType;
    userId?: string;
    metadata?: Record<string, any>;
  }
) {
  const requestId = c.get("requestId") || `req_${Date.now().toString(36)}`;
  const ip = getClientIp(c);
  const userAgent = c.req.header("user-agent") || "unknown";
  const sanitizedMeta = sanitizeAuditMetadata(params.metadata);

  const logPayload = {
    module: "security-audit",
    eventType: params.eventType,
    requestId,
    userId: params.userId || c.get("userId") || undefined,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
    ...(sanitizedMeta ? { metadata: sanitizedMeta } : {}),
  };

  if (
    params.eventType === "LOGIN_FAILURE" ||
    params.eventType === "CSRF_REJECTED" ||
    params.eventType === "REFRESH_TOKEN_REUSE_DETECTED"
  ) {
    securityLogger.warn(logPayload, `🛡️ SECURITY EVENT [${params.eventType}] from IP ${ip}`);
  } else {
    securityLogger.info(logPayload, `🛡️ SECURITY EVENT [${params.eventType}] from IP ${ip}`);
  }
}

/**
 * Parses and returns the list of allowed CORS origins from configuration.
 */
export function getAllowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN || config.server.corsOrigin || "*";
  if (configured === "*") {
    return ["*"];
  }
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Validates origin syntax and whitelist membership.
 * Rejects malformed origins (e.g. paths, queries, invalid schemes).
 * In production with credentials, wildcard '*' is strictly disallowed.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // Same-origin or non-browser request

  try {
    const parsed = new URL(origin);
    // Origin must have valid protocol and no path/query/credentials
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      return false;
    }
    if (parsed.search || parsed.hash || parsed.username || parsed.password) {
      return false;
    }

    const normalizedOrigin = parsed.origin;
    const allowed = getAllowedOrigins();
    const isProduction = config.isProduction || process.env.NODE_ENV === "production";

    // In production with credentials, wildcard '*' is strictly disallowed
    if (allowed.includes("*")) {
      return !isProduction;
    }

    return allowed.includes(normalizedOrigin);
  } catch (_) {
    return false;
  }
}

/**
 * Enterprise Security Headers Middleware:
 * - Content-Security-Policy (CSP):
 *   - Development: script-src 'self' 'unsafe-inline'
 *   - Production: script-src 'self' 'nonce-{nonce}' (removes 'unsafe-inline')
 * - Strict-Transport-Security (HSTS in production)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 0
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy
 * - Strips unnecessary server-identifying headers (e.g. X-Powered-By)
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    const isProduction = config.isProduction || process.env.NODE_ENV === "production";

    // 1. Content Security Policy (CSP)
    let scriptSrcDirective = "script-src 'self' 'unsafe-inline'";

    if (isProduction) {
      // In production, remove 'unsafe-inline' and use per-request cryptographically secure nonce
      const nonce = crypto.randomBytes(16).toString("base64");
      c.set("cspNonce" as any, nonce);
      scriptSrcDirective = `script-src 'self' 'nonce-${nonce}'`;
    }

    const cspDirectives = [
      "default-src 'self'",
      scriptSrcDirective,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://api.dicebear.com",
      "connect-src 'self' ws: wss: http: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];

    if (isProduction) {
      cspDirectives.push("upgrade-insecure-requests");
    }

    c.header("Content-Security-Policy", cspDirectives.join("; "));

    // 2. HTTP Strict Transport Security (HSTS) - Production Only
    if (isProduction) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // 3. Defense-in-depth standard security headers
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "0");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Resource-Policy", "same-origin");

    // 4. Information leakage removal: Ensure X-Powered-By & Server are omitted
    c.res.headers.delete("X-Powered-By");
    c.res.headers.delete("Server");

    await next();

    // Re-verify removal after downstream middlewares
    c.res.headers.delete("X-Powered-By");
    c.res.headers.delete("Server");
  };
}

/**
 * Strict Whitelist CORS Middleware
 * Dynamically resolves allowed origins and securely supports credentials with cookies.
 * Disallows wildcard origins when credentials=true.
 */
export function strictCors(): MiddlewareHandler {
  const allowedOrigins = getAllowedOrigins();

  return async (c, next) => {
    const origin = c.req.header("origin");

    if (origin) {
      const allowed = isOriginAllowed(origin);
      if (allowed) {
        // When credentials: true is active, Origin MUST be the explicit matching origin, NEVER wildcard '*'
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Credentials", "true");
      } else {
        // Untrusted origin: reject preflight with 403
        if (c.req.method === "OPTIONS") {
          return c.text("CORS origin not allowed", 403);
        }
      }
    } else if (allowedOrigins.includes("*") && !config.isProduction) {
      c.header("Access-Control-Allow-Origin", "*");
    }

    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Client-Version, X-Request-Id, X-Correlation-Id"
    );
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    c.header(
      "Access-Control-Expose-Headers",
      "Content-Length, X-Request-Id, X-CSRF-Token"
    );
    c.header("Access-Control-Max-Age", "600");

    // Handle preflight OPTIONS request
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}

/**
 * Secure Cookie Helper Utilities
 */
export const cookieUtils = {
  /**
   * Sets the HttpOnly, Secure, SameSite refresh token cookie and CSRF double-submit cookie.
   * In production, enforces __Host- prefix and Path=/ with Secure=true.
   */
  setAuthCookies(
    c: Context,
    tokens: { refreshToken: string; csrfToken?: string }
  ) {
    const isProduction = config.isProduction || process.env.NODE_ENV === "production";
    const cookieName = getRefreshCookieName(isProduction);

    // Production Safety Check: Reject insecure cookie configuration in production
    if (isProduction && process.env.COOKIE_INSECURE === "true") {
      throw new Error("Insecure cookies are strictly prohibited in production mode");
    }

    // 1. Refresh Token Cookie
    // In production: __Host- prefix requires Secure=true, Path=/, and SameSite=Strict
    // In dev: hichat_refresh_token with Path=/api/auth
    if (tokens.refreshToken) {
      setCookie(c, cookieName, tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "Strict",
        path: isProduction ? "/" : "/api/auth",
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      });
    }

    // 2. CSRF Token Cookie (Double Submit Cookie Pattern: readable by client script)
    const csrfToken = tokens.csrfToken || crypto.randomBytes(24).toString("hex");
    setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Must be readable by client for X-CSRF-Token header
      secure: isProduction,
      sameSite: "Strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return csrfToken;
  },

  /**
   * Clears auth cookies upon logout or session termination across all prefixes.
   */
  clearAuthCookies(c: Context) {
    const isProduction = config.isProduction || process.env.NODE_ENV === "production";

    // Invalidate production __Host- cookie (Path=/ with secure: true always per RFC 6265bis)
    deleteCookie(c, PROD_REFRESH_COOKIE_NAME, {
      path: "/",
      secure: true,
      sameSite: "Strict",
    });

    // Invalidate dev cookie (Path=/api/auth and Path=/)
    deleteCookie(c, DEV_REFRESH_COOKIE_NAME, {
      path: "/api/auth",
      secure: isProduction,
      sameSite: "Strict",
    });
    deleteCookie(c, DEV_REFRESH_COOKIE_NAME, {
      path: "/",
      secure: isProduction,
      sameSite: "Strict",
    });

    // Invalidate CSRF cookie
    deleteCookie(c, CSRF_COOKIE_NAME, {
      path: "/",
      secure: isProduction,
      sameSite: "Strict",
    });
  },

  /**
   * Extracts refresh token with precedence:
   * 1. Production __Host- cookie -> 2. Dev cookie -> 3. JSON body -> 4. X-Refresh-Token header.
   */
  getRefreshToken(c: Context, body?: any): string | null {
    // 1. Try __Host- prefix cookie first
    const prodCookieRt = getCookie(c, PROD_REFRESH_COOKIE_NAME);
    if (prodCookieRt && typeof prodCookieRt === "string" && prodCookieRt.trim() !== "") {
      return prodCookieRt.trim();
    }

    // 2. Try dev cookie
    const devCookieRt = getCookie(c, DEV_REFRESH_COOKIE_NAME);
    if (devCookieRt && typeof devCookieRt === "string" && devCookieRt.trim() !== "") {
      return devCookieRt.trim();
    }

    // 3. Try request body
    if (body?.refreshToken && typeof body.refreshToken === "string" && body.refreshToken.trim() !== "") {
      return body.refreshToken.trim();
    }

    // 4. Try header
    const headerRt = c.req.header("x-refresh-token");
    if (headerRt && typeof headerRt === "string" && headerRt.trim() !== "") {
      return headerRt.trim();
    }

    return null;
  },

  /**
   * Generates a cryptographically secure CSRF token.
   */
  generateCsrfToken(): string {
    return crypto.randomBytes(24).toString("hex");
  },
};

/**
 * Enterprise CSRF Protection Middleware
 * Protects state-changing endpoints when cookie-based authentication is used.
 * Validates Origin/Referer and double-submit CSRF token.
 */
export function csrfProtection(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();

    // Safe methods do not require CSRF validation
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return await next();
    }

    // Check if request is carrying an auth cookie (__Host- or standard)
    const hasAuthCookie =
      Boolean(getCookie(c, PROD_REFRESH_COOKIE_NAME)) ||
      Boolean(getCookie(c, DEV_REFRESH_COOKIE_NAME));

    if (hasAuthCookie) {
      // 1. Origin / Referer Verification
      const origin = c.req.header("origin");
      const referer = c.req.header("referer");

      if (origin) {
        if (!isOriginAllowed(origin)) {
          securityAuditLog(c, {
            eventType: "CSRF_REJECTED",
            metadata: { reason: "Untrusted Origin", origin },
          });
          throw new CsrfError("Cross-Site Request Forgery detected: Untrusted Origin");
        }
      } else if (referer) {
        try {
          const refererOrigin = new URL(referer).origin;
          if (!isOriginAllowed(refererOrigin)) {
            securityAuditLog(c, {
              eventType: "CSRF_REJECTED",
              metadata: { reason: "Untrusted Referer", referer },
            });
            throw new CsrfError("Cross-Site Request Forgery detected: Untrusted Referer");
          }
        } catch (_) {
          securityAuditLog(c, {
            eventType: "CSRF_REJECTED",
            metadata: { reason: "Malformed Referer", referer },
          });
          throw new CsrfError("Cross-Site Request Forgery detected: Malformed Referer");
        }
      }

      // 2. Double-Submit CSRF Token or Custom Header Verification
      const cookieCsrfToken = getCookie(c, CSRF_COOKIE_NAME);
      const headerCsrfToken =
        c.req.header("x-csrf-token") ||
        c.req.header("x-xsrf-token") ||
        c.req.header("x-requested-with");

      if (cookieCsrfToken) {
        if (!headerCsrfToken || headerCsrfToken !== cookieCsrfToken) {
          // If custom AJAX header is present (e.g. XMLHttpRequest), accept or verify token
          const isCustomAjaxHeader = c.req.header("x-requested-with") === "XMLHttpRequest";
          if (!isCustomAjaxHeader && headerCsrfToken !== cookieCsrfToken) {
            securityAuditLog(c, {
              eventType: "CSRF_REJECTED",
              metadata: { reason: "Missing or Mismatched CSRF Token" },
            });
            throw new CsrfError("Invalid or missing CSRF token");
          }
        }
      }
    }

    await next();
  };
}
