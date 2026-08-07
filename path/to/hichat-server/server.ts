import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createServer } from "http";
import { Server } from "socket.io";
import { initDb } from "./src/db/db";
import { authRouter } from "./src/routes/auth";
import { usersRouter } from "./src/routes/users";
import { roomsRouter } from "./src/routes/rooms";
import { messagesRouter } from "./src/routes/messages";
import { logger } from "./src/core/logger";
import { errorHandler } from "./src/core/errors";
import { apiRateLimiter } from "./src/middleware/rateLimit";
import "dotenv/config";
import jwt from "jsonwebtoken";

// Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = Number(process.env.PORT) || 3001;

// Initialize SQLite database schema
initDb();

// Create Hono application instance with OpenAPI support
const app = new OpenAPIHono();

// Global Middleware
app.use("*", async (c, next) => {
  logger.info({ method: c.req.method, path: c.req.path }, "Incoming Request");
  await next();
});

app.use("*", cors({
  origin: FRONTEND_URL,
  allowHeaders: ["Content-Type", "Authorization", "X-Client-Version"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
  credentials: true,
}));

// API Rate Limiting
app.use("/api/*", apiRateLimiter);

// Enterprise Security Headers
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Powered-By", "HiChat Premium Engine");
  await next();
});

// Error Handling
app.onError(errorHandler);

// OpenAPI Documentation
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "HiChat Premium API",
    description: "Enterprise-grade E2EE Messaging Platform API",
  },
});

app.get("/ui", swaggerUI({ url: "/doc" }));

// Serve static files for the React frontend (build output in ./dist)
import { serveStatic } from "hono/serve-static";
import { join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/", serveStatic({
  root: join(__dirname, "..", "dist"),
  prefix: "/",
  fallback: true // serve index.html for unknown routes (SPA fallback)
}));

// API Routes
app.route("/api/auth", authRouter);
app.route("/api/users", usersRouter);
app.route("/api/rooms", roomsRouter);
app.route("/api/messages", messagesRouter);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Catch‑all route for SPA fallback (optional, ensures any unknown path serves index.html)
app.get("*", async (c) => {
  // The static middleware already handles this, but we keep a fallback for safety
  return c.htmlFile(join(__dirname, "..", "dist", "index.html"));
});

// HTTP server setup
import { getRequestListener } from "@hono/node-server";

const server = createServer(getRequestListener(app.fetch));

// Socket.io gateway
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e7, // 10MB file buffer
});

// Socket.io connection handling
io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    logger.warn({ socketId: socket.id }, "Socket connection rejected: missing token");
    return socket.disconnect(true);
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "super-secret-hichat-key-2026") as any;
    (socket as any).user = payload;
    logger.info({ username: payload.username, socketId: socket.id }, "Socket connected");
  } catch (err) {
    logger.error({ err, socketId: socket.id }, "Invalid token on socket connection");
    return socket.disconnect(true);
  }

  socket.on("join", (data) => {
    const { username, room } = data;
    socket.join(room);
    logger.info({ username, room }, "User joined room");
    socket.emit("joined", { room, username, timestamp: Date.now() });
  });

  socket.on("disconnect", (reason) => {
    logger.info({ socketId: socket.id, reason }, "Socket disconnected");
  });
});

// Graceful Shutdown
const shutdown = () => {
  logger.info("Shutting down server...");
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start listening
server.listen(PORT, () => {
  logger.info({ port: PORT }, "🚀 HiChat Premium Backend running");
  logger.info("⚡ Dubai Enterprise Grade: Bun + Hono + OpenAPI + Socket.io + SQLite WAL");
});
