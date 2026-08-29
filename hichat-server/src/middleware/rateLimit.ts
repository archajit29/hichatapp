import { rateLimiter } from "hono-rate-limiter";
import { AppError, ErrorCode } from "../core/errors";
import { getClientIp } from "./security";

export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // Limit each IP to 20 requests per windowMs for auth routes
  standardHeaders: "draft-6",
  keyGenerator: (c) => getClientIp(c) || "anonymous",
  handler: (c) => {
    throw new AppError("Too many login attempts, please try again later", 429, ErrorCode.RATE_LIMIT_EXCEEDED);
  },
});

export const apiRateLimiter = rateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 100, // 100 requests per minute
  standardHeaders: "draft-6",
  keyGenerator: (c) => getClientIp(c) || "anonymous",
  handler: (c) => {
    throw new AppError("API rate limit exceeded", 429, ErrorCode.RATE_LIMIT_EXCEEDED);
  },
});
