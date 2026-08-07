import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { initDb, db } from "./src/db/db";
import { authRouter } from "./src/routes/auth";
import { usersRouter } from "./src/routes/users";
import { roomsRouter } from "./src/routes/rooms";
import { messagesRouter } from "./src/routes/messages";
import { setupSocket } from "./src/socket/chatSocket";
import "dotenv/config";

// Load environment variables
const PORT = Number(process.env.PORT) || 3001;

// Initialize SQLite database schema
initDb();

// Create Hono application instance
const app = new Hono();

// Enable Permissive CORS for Frontend (Vite on 5173, Next.js on 3000, etc.)
app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "X-Client-Version"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
  maxAge: 600,
  credentials: false,
}));

// Enterprise Security Headers
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Powered-By", "HiChat Enterprise E2EE Platform");
  await next();
});

// API Routes
app.route("/api/auth", authRouter);
app.route("/api/users", usersRouter);
app.route("/api/rooms", roomsRouter);
app.route("/api/messages", messagesRouter);

// System stats endpoint for Dashboard
app.get("/api/stats", (c) => {
  try {
    const usersCount = (db.prepare("SELECT COUNT(*) as cnt FROM users").get() as any)?.cnt || 0;
    const roomsCount = (db.prepare("SELECT COUNT(*) as cnt FROM rooms").get() as any)?.cnt || 0;
    const messagesCount = (db.prepare("SELECT COUNT(*) as cnt FROM messages").get() as any)?.cnt || 0;
    return c.json({
      success: true,
      usersCount,
      roomsCount,
      messagesCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "HiChat Enterprise E2EE Platform",
    status: "online",
    runtime: "Bun + Hono + Socket.io + SQLite WAL",
    timestamp: new Date().toISOString(),
  });
});

// HTTP server setup
import { getRequestListener } from "@hono/node-server";

const server = createServer(getRequestListener(app.fetch));

// Initialize Socket.io gateway
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10MB file buffer
});

// Setup complete real-time socket handlers from chatSocket.ts
setupSocket(io);

// Graceful Shutdown
const shutdown = () => {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start listening
server.listen(PORT, () => {
  console.log(`🚀 HiChat Production Backend running on http://localhost:${PORT}`);
});



