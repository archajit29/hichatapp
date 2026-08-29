import pino from "pino";
import { config } from "./config";

const isProduction = config.isProduction;
const logLevel = config.logging.level;

/**
 * Comprehensive list of sensitive paths to automatically redact across all log outputs.
 */
export const REDACTION_PATHS = [
  // HTTP Headers & Auth
  "authorization",
  "cookie",
  "set-cookie",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "headers.Set-Cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "req.headers.Set-Cookie",
  "req.headers['authorization']",

  // Credentials & Passwords
  "password",
  "confirmPassword",
  "password_hash",
  "passwordHash",
  "oldPassword",
  "newPassword",
  "credentials",
  "secret",
  "secrets",
  "sessionSecret",

  // Tokens & Session Identifiers
  "token",
  "jwt",
  "accessToken",
  "refreshToken",
  "authToken",
  "tokenPayload",
  "auth.token",
  "handshake.auth.token",
  "socket.handshake.auth.token",

  // Signal Protocol Cryptographic Material
  "identityKey",
  "identity_key",
  "signedPreKey",
  "signed_prekey",
  "signedPreKeySignature",
  "signature",
  "preKey",
  "preKeys",
  "oneTimePreKeys",
  "one_time_prekeys",
  "registrationId",
  "registration_id",
  "sessionKey",
  "sessionKeys",
  "sessionRecord",
  "session_record",
  "plaintext",
  "ciphertext",
  "ciphertext.body",
  "payloads",

  // Nested Body / Data / Payload Objects
  "body.password",
  "body.confirmPassword",
  "body.token",
  "body.jwt",
  "body.identityKey",
  "body.signedPreKey",
  "body.oneTimePreKeys",
  "body.ciphertext",
  "data.password",
  "data.confirmPassword",
  "data.token",
  "data.jwt",
  "data.ciphertext",
  "data.payloads",
  "data.publicKey",
  "data.identityKey",
  "data.signedPreKey",
  "data.oneTimePreKeys",

  // Wildcard patterns for deep nesting
  "*.password",
  "*.confirmPassword",
  "*.password_hash",
  "*.passwordHash",
  "*.token",
  "*.jwt",
  "*.accessToken",
  "*.refreshToken",
  "*.authorization",
  "*.cookie",
  "*.identityKey",
  "*.signedPreKey",
  "*.signature",
  "*.oneTimePreKeys",
  "*.ciphertext",
  "*.payloads",
  "*.*.password",
  "*.*.confirmPassword",
  "*.*.token",
  "*.*.jwt",
  "*.*.identityKey",
  "*.*.signedPreKey",
  "*.*.ciphertext",
];

/**
 * Production-Grade Centralized Pino Logger with Sensitive Data Redaction
 * Outputs structured JSON in production (for CloudWatch/Datadog/ELK)
 * and formatted colorized logs via pino-pretty in development.
 */
export const logger = pino({
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACTION_PATHS,
    censor: "[REDACTED]",
  },
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      service: "hichat-server",
    }),
  },
  serializers: {
    err: (err: any) => {
      const serialized = pino.stdSerializers.err(err);
      if (serialized && typeof serialized === "object") {
        for (const key of Object.keys(serialized)) {
          if (
            /password|token|jwt|secret|key|ciphertext|authorization|cookie/i.test(key) &&
            key !== "stack" &&
            key !== "message"
          ) {
            (serialized as any)[key] = "[REDACTED]";
          }
        }

        if (err?.cause) {
          const rawCause = err.cause;
          (serialized as any).cause = rawCause instanceof Error
            ? {
                name: rawCause.name,
                message: rawCause.message,
                stack: rawCause.stack,
              }
            : rawCause;
        }

        if (typeof err?.getRootCause === "function") {
          const root = err.getRootCause();
          if (root instanceof Error) {
            (serialized as any).rootCause = {
              name: root.name,
              message: root.message,
              stack: root.stack,
            };
          }
        }
      }
      return serialized;
    },
    error: (err: any) => {
      const serialized = pino.stdSerializers.err(err);
      if (serialized && typeof serialized === "object") {
        for (const key of Object.keys(serialized)) {
          if (
            /password|token|jwt|secret|key|ciphertext|authorization|cookie/i.test(key) &&
            key !== "stack" &&
            key !== "message"
          ) {
            (serialized as any)[key] = "[REDACTED]";
          }
        }

        if (err?.cause) {
          const rawCause = err.cause;
          (serialized as any).cause = rawCause instanceof Error
            ? {
                name: rawCause.name,
                message: rawCause.message,
                stack: rawCause.stack,
              }
            : rawCause;
        }

        if (typeof err?.getRootCause === "function") {
          const root = err.getRootCause();
          if (root instanceof Error) {
            (serialized as any).rootCause = {
              name: root.name,
              message: root.message,
              stack: root.stack,
            };
          }
        }
      }
      return serialized;
    },
  },
  transport: !isProduction
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname,service",
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          singleLine: false,
        },
      }
    : undefined,
});

/**
 * Helper to spawn child logger with contextual request/user metadata.
 */
export function getScopedLogger(context: {
  requestId?: string;
  userId?: string;
  username?: string;
  socketId?: string;
  module?: string;
  [key: string]: any;
}) {
  return logger.child(context);
}

export type Logger = typeof logger;
