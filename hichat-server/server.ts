import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync } from "fs";
import { initDb } from "./src/db/db";
import { authRouter } from "./src/routes/auth";
import { usersRouter } from "./src/routes/users";
import { roomsRouter } from "./src/routes/rooms";
import { messagesRouter } from "./src/routes/messages";
import { setupSocket } from "./src/socket/chatSocket";
import "dotenv/config";

// Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = Number(process.env.PORT) || 3001;

// Initialize SQLite database schema
initDb();

// Create Hono application instance
const app = new Hono();

// Global Middleware & Security Headers
app.use("*", cors({
  origin: FRONTEND_URL,
  allowHeaders: ["Content-Type", "Authorization", "X-Client-Version"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

// Add Enterprise Security Headers
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Powered-By", "Bun + Hono + WebCrypto E2EE Engine");
  await next();
});

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
  });
});

// HTTP server setup
import { getRequestListener } from "@hono/node-server";

const server = createServer(getRequestListener(app.fetch));

// Initialize Socket.io gateway with matching CORS
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10MB file buffer
});

setupSocket(io);

// Start listening
server.listen(PORT, () => {
  console.log(`🚀 HiChat Production Backend running on http://localhost:${PORT}`);
  console.log(`⚡ Dubai Enterprise Grade: Bun + Hono + Socket.io + SQLite E2EE Engine`);
});
