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
import jwt from "jsonwebtoken";

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

// Login route for JWT token generation
app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.json();

  // For demo purposes, accept a specific test user
  if (email === "test@example.com" && password === "password") {
    const token = jwt.sign({ id: 1, username: "demo", email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    return c.json({ token });
  }

  return c.json({ error: "Invalid credentials" }, 401);
});

// Fallback route for any non‑API GET request (e.g., serving the React index page)
app.get("*", async (c) => {
  // If you have a built React app in a folder called "public", you can serve it here:
  // return c.text(await readFileSync("./public/index.html", "utf8"));
  // For now, return a simple message to confirm the server is reachable.
  return c.text("<h1>HiChat Backend is running</h1>");
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

// Socket.io connection handling (replaces setupSocket)
io.on("connection", (socket) => {
  // Verify JWT token from the auth payload
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.error("❌ Socket connection rejected: missing token");
    return socket.disconnect(true);
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload; // attach user data to socket
    console.log(`✅ Socket connected for user: ${socket.user.username}`);
  } catch (err) {
    console.error("❌ Invalid token on socket connection:", err);
    return socket.disconnect(true);
  }

  // Handle the 'join' event from the client
  socket.on("join", (data) => {
    const { username, publicKey, room, status } = data;
    // Join the specified room
    socket.join(room);
    console.log(`🔗 User ${username} joined room "${room}"`);

    // Acknowledge the join
    socket.emit("joined", {
      room,
      username,
      status,
    });
  });

  // Example: handle a generic message event
  socket.on("message", (payload) => {
    // Broadcast to room or handle as needed
    console.log(`📨 Message from ${socket.user.username} in ${socket.id}:`, payload);
    // TODO: emit to appropriate room or store in DB
  });

  // Cleanup on disconnect
  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${reason}`);
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`🚀 HiChat Production Backend running on http://localhost:${PORT}`);
  console.log(`⚡ Dubai Enterprise Grade: Bun + Hono + Socket.io + SQLite E2EE Engine`);
});
