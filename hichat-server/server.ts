import { Hono } from "hono";
import { createServer } from "http";
import { Server } from "socket.io";
import { config, getConfigurationHealth } from "./src/core/config";
import { NotFoundError } from "./src/core/errors";
import { initDb, healthCheck as pgHealthCheck, disconnect as disconnectPg, healthCheckRedis, disconnectRedis } from "./src/db/db";
import { StatsService, PresenceService } from "./src/services";
import { authRouter } from "./src/routes/auth";
import { usersRouter } from "./src/routes/users";
import { roomsRouter } from "./src/routes/rooms";
import { messagesRouter } from "./src/routes/messages";
import { keysRouter } from "./src/routes/keys";
import { setupSocket, startSocketSchedulers, stopSocketSchedulers } from "./src/socket/chatSocket";
import { setupRedisAdapter, closeRedisAdapter } from "./src/socket/socketAdapter";
import { logger } from "./src/core/logger";
import { httpLogger } from "./src/middleware/httpLogger";
import { strictCors, securityHeaders, csrfProtection, getAllowedOrigins } from "./src/middleware/security";
import { centralizedErrorHandler, centralizedNotFoundHandler } from "./src/middleware/errorHandler";
import { getRequestListener } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { openApiSpec } from "./src/docs/openApiSpec";

const PORT = config.server.port;

// Create Hono application instance
const app = new Hono();

// Production Structured HTTP Request Logger
app.use("*", httpLogger());

// Enterprise Security Headers (CSP, HSTS in prod, nosniff, DENY, removes X-Powered-By)
app.use("*", securityHeaders());

// Strict Whitelist CORS with Secure Cookie Credential Support
app.use("*", strictCors());

// Enterprise Anti-CSRF Protection for Cookie-Authenticated Requests
app.use("/api/*", csrfProtection());

// Centralized Unhandled Error Handler & 404 Handler
app.onError(centralizedErrorHandler);
app.notFound(centralizedNotFoundHandler);

// API Routes
app.route("/api/auth", authRouter);
app.route("/api/users", usersRouter);
app.route("/api/rooms", roomsRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/keys", keysRouter);
app.route("/keys", keysRouter);

// System stats endpoint for Dashboard
app.get("/api/stats", async (c) => {
  try {
    const stats = await StatsService.getSystemStats();
    return c.json({
      success: true,
      ...stats,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Health check endpoint with live PostgreSQL, Upstash Redis, and Presence diagnostics (Phase 13E)
app.get("/health", async (c) => {
  const [dbHealth, redisHealth, presenceStats] = await Promise.all([
    pgHealthCheck(),
    healthCheckRedis(),
    PresenceService.getPresenceStats(),
  ]);

  return c.json({
    status: dbHealth.healthy && redisHealth.healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: dbHealth,
    redis: redisHealth,
    presence: presenceStats,
  });
});

// Configuration health check endpoint (development only - Phase 12.1)
app.get("/health/config", (c) => {
  if (config.isProduction) {
    throw new NotFoundError("Cannot GET /health/config");
  }

  const healthStatus = getConfigurationHealth();
  return c.json(healthStatus);
});

// OpenAPI 3.1 JSON Specification (Phase 14B)
app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

// Interactive Swagger UI Documentation (Phase 14B)
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "HiChat Enterprise E2EE Platform",
    status: "online",
    runtime: "Bun + Hono + Socket.io + PostgreSQL (Neon/RDS) + Upstash Redis",
    documentation: "/docs",
    openapi: "/openapi.json",
    timestamp: new Date().toISOString(),
  });
});

// HTTP server setup
const server = createServer(getRequestListener(app.fetch));

// Initialize Socket.io gateway with strict CORS whitelist
const allowedOrigins = getAllowedOrigins();
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e7, // 10MB file buffer
});

// Setup complete real-time socket handlers from chatSocket.ts (listeners only)
setupSocket(io);

// Graceful Shutdown
const shutdown = async () => {
  logger.info("Shutting down server...");
  stopSocketSchedulers();
  await closeRedisAdapter();
  await disconnectRedis();
  await disconnectPg();
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start listening with automatic PostgreSQL migrations, table verification, seeds, and socket schedulers
export async function startServer(portOverride?: number) {
  // 1-4. Connect, migrate, verify tables, and run seeds
  await initDb();

  // 5. Attach Socket.IO Redis Pub/Sub adapter for horizontal multi-container scaling (Phase 13E)
  await setupRedisAdapter(io);

  // 6. Start socket background schedulers strictly AFTER database is ready
  startSocketSchedulers(io);

  const listenPort = portOverride || PORT;
  return new Promise<number>((resolve) => {
    server.listen(listenPort, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : listenPort;
      logger.info({ port: actualPort, env: config.env }, `🚀 HiChat Production Backend running on http://localhost:${actualPort}`);
      resolve(actualPort);
    });
  });
}

export { app, server, io };

// Automatically start if executed as main module
if (import.meta.main || process.argv[1]?.endsWith("server.ts")) {
  startServer().catch((err) => {
    logger.fatal({ err }, "Fatal startup error initializing database or server");
    process.exit(1);
  });
}
