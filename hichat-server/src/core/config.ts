import dotenv from "dotenv";
dotenv.config();
import { z } from "zod";

/**
 * Zod Schema for Environment Variables Validation
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .coerce
    .number()
    .int()
    .positive("PORT must be a positive integer")
    .default(3001),
  HOST: z
    .string()
    .default("0.0.0.0"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters long")
    .default("super-secret-hichat-key-2026-production-secure"),
  JWT_SECRET_KEY: z
    .string()
    .optional(),
  JWT_EXPIRES_IN: z
    .string()
    .default("15m"),
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .default("15m"),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default("7d"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  DB_DRIVER: z
    .enum(["postgres", "postgresql", "sqlite"])
    .default("postgres"),
  DB_MAX_CONNECTIONS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(20),
  DB_IDLE_TIMEOUT_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(30000),
  DB_CONNECTION_TIMEOUT_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(10000),
  CORS_ORIGIN: z
    .string()
    .default("*"),
  TRUST_PROXY: z
    .string()
    .default("true"),
  RATE_LIMIT_MAX: z
    .coerce
    .number()
    .int()
    .positive()
    .default(100),
  RATE_LIMIT_WINDOW_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(60000),
  MAILBOX_RETRY_INTERVAL_MS: z
    .coerce
    .number()
    .int()
    .positive()
    .default(5000),
  MAILBOX_MAX_RETRIES: z
    .coerce
    .number()
    .int()
    .positive()
    .default(5),
  MAILBOX_RETRY_DELAYS: z
    .string()
    .optional()
    .default("0,5000,15000,30000,60000"),
  REDIS_URL: z
    .string()
    .optional()
    .default("redis://localhost:6379"),
});


export type RawEnv = z.infer<typeof envSchema>;

/**
 * Validates environment variables and constructs a typed immutable Config object.
 * Fails fast with descriptive error messages if required variables are missing or invalid.
 */
export function validateConfig(rawEnv: Record<string, any> = process.env) {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");

    const failureMessage =
      `\n❌ [FATAL CONFIGURATION ERROR] Environment validation failed:\n` +
      `${errorDetails}\n\n` +
      `Please ensure all required environment variables are properly defined before starting the server.\n`;

    console.error(failureMessage);
    throw new Error(failureMessage);
  }

  const parsed = result.data;
  const isProduction = parsed.NODE_ENV === "production";
  const isDevelopment = parsed.NODE_ENV === "development";
  const isTest = parsed.NODE_ENV === "test";

  // Production Safety Checks: Reject default secrets in production
  if (isProduction && parsed.JWT_SECRET === "super-secret-hichat-key-2026-production-secure") {
    const prodSecretMsg =
      `\n❌ [SECURITY ERROR] Insecure default JWT_SECRET cannot be used in production mode.\n` +
      `Set a strong, random JWT_SECRET environment variable.\n`;
    console.error(prodSecretMsg);
    throw new Error(prodSecretMsg);
  }

  // Determine environment-aware log level
  const resolvedLogLevel =
    parsed.LOG_LEVEL || (isProduction ? "info" : isTest ? "error" : "debug");

  const parsedRetryDelays = (parsed.MAILBOX_RETRY_DELAYS || "0,5000,15000,30000,60000")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  return {
    env: parsed.NODE_ENV,
    isProduction,
    isDevelopment,
    isTest,
    server: {
      port: parsed.PORT,
      host: parsed.HOST,
      corsOrigin: parsed.CORS_ORIGIN,
      trustProxy: parsed.TRUST_PROXY === "true" || parsed.TRUST_PROXY === "1" ? true : parsed.TRUST_PROXY === "false" || parsed.TRUST_PROXY === "0" ? false : parsed.TRUST_PROXY,
    },
    auth: {
      jwtSecret: parsed.JWT_SECRET,
      jwtExpiresIn: parsed.JWT_EXPIRES_IN,
      jwtAccessExpiresIn: parsed.JWT_ACCESS_EXPIRES_IN || parsed.JWT_EXPIRES_IN || "15m",
      jwtRefreshExpiresIn: parsed.JWT_REFRESH_EXPIRES_IN || "7d",
    },
    logging: {
      level: resolvedLogLevel,
    },
    database: {
      driver:
        parsed.DB_DRIVER === "sqlite" && isDevelopment
          ? "sqlite"
          : "postgres",

      url: parsed.DATABASE_URL,

      redisUrl: parsed.REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379",

      sqlitePath:
        parsed.DB_DRIVER === "sqlite"
          ? parsed.DATABASE_URL
          : undefined,

      maxConnections: parsed.DB_MAX_CONNECTIONS,

      idleTimeoutMillis: parsed.DB_IDLE_TIMEOUT_MS,

      connectionTimeoutMillis: parsed.DB_CONNECTION_TIMEOUT_MS,
    },
    
    rateLimit: {
      max: parsed.RATE_LIMIT_MAX,
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
    },
    
    mailbox: {
      retryIntervalMs: parsed.MAILBOX_RETRY_INTERVAL_MS,
      maxRetries: parsed.MAILBOX_MAX_RETRIES,
      retryDelays:
        parsedRetryDelays.length > 0
          ? parsedRetryDelays
          : [0, 5000, 15000, 30000, 60000],
    },
    
  } as const;
}

/**
 * Required environment variable keys that must be defined.
 */
export const REQUIRED_ENV_VARS = ["NODE_ENV", "PORT", "JWT_SECRET", "DATABASE_URL"] as const;

/**
 * Optional environment variable keys with sensible defaults.
 */
export const OPTIONAL_ENV_VARS = [
  "HOST",
  "CORS_ORIGIN",
  "TRUST_PROXY",
  "JWT_EXPIRES_IN",
  "JWT_ACCESS_EXPIRES_IN",
  "JWT_REFRESH_EXPIRES_IN",
  "LOG_LEVEL",
  "DB_DRIVER",
  "DB_MAX_CONNECTIONS",
  "DB_IDLE_TIMEOUT_MS",
  "DB_CONNECTION_TIMEOUT_MS",
  "RATE_LIMIT_MAX",
  "RATE_LIMIT_WINDOW_MS",
  "MAILBOX_RETRY_INTERVAL_MS",
  "MAILBOX_MAX_RETRIES",
  "MAILBOX_RETRY_DELAYS",
  "REDIS_URL",
] as const;

/**
 * Returns configuration health and validation status without leaking secret values (Phase 12.1).
 * Never exposes passwords, JWT secrets, or sensitive hashes.
 */
export function getConfigurationHealth(rawEnv: Record<string, any> = process.env) {
  const missingVariables: string[] = [];
  const invalidVariables: string[] = [];

  for (const reqVar of REQUIRED_ENV_VARS) {
    if (rawEnv[reqVar] === undefined || String(rawEnv[reqVar]).trim() === "") {
      missingVariables.push(reqVar);
    }
  }

  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const varName = issue.path[0]?.toString() || "UNKNOWN";
      if (!invalidVariables.includes(varName) && !missingVariables.includes(varName)) {
        invalidVariables.push(varName);
      }
    }
  }

  return {
    configLoaded: true,
    env: (rawEnv.NODE_ENV as "development" | "production" | "test") || "development",
    missingVariables,
    invalidVariables,
  };
}

/**
 * Singleton Application Configuration
 */
export const config = validateConfig();
export type Config = ReturnType<typeof validateConfig>;
