import { Server, Socket } from "socket.io";
import { db } from "../db/db";
import * as crypto from "crypto";

/**
 * Enum representing possible user presence statuses.
 */
enum UserStatus {
  ONLINE = "online",
  AWAY = "away",
  DND = "dnd",
  OFFLINE = "offline",
}

/**
 * Interface describing an active user attached to a socket.
 * Added `encKey` to hold the symmetric key derived from the user's public key.
 */
interface ActiveUser {
  userId?: string;
  username: string;
  publicKey: string;
  socketId: string;
  currentRoom: string;
  status: UserStatus;
  customStatus?: string;
  encKey: Buffer; // symmetric key for AES‑256‑GCM
}

/**
 * Payload definitions for socket events.
 */
interface JoinData {
  userId?: string;
  username: string;
  publicKey: string;
  room?: string;
  status?: keyof typeof UserStatus;
}

interface SwitchRoomData {
  newRoom: string;
}

interface UpdateStatusData {
  status: keyof typeof UserStatus;
}

interface SendMessageData {
  roomId: string;
  senderId?: string;
  author: string;
  payloads: Record<string, string>;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  time?: string;
}

interface DeleteMessageData {
  messageId: string;
  roomId: string;
}

interface TypingData {
  username: string;
  roomId: string;
}

interface ReactionData {
  messageId: string;
  emoji: string;
  username: string;
  roomId: string;
}

/**
 * Simple in‑memory rate limiter: max 5 messages per 2 seconds per socket.
 */
const MESSAGE_LIMIT = 5;
const MESSAGE_WINDOW_MS = 2_000;
const messageTimestamps = new Map<string, number[]>();

/**
 * Helper to log with a timestamp prefix.
 */
function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

/**
 * Derive a 256‑bit symmetric key from a public key string.
 * Using SHA‑256 ensures we get a fixed‑length key suitable for AES‑256.
 */
function deriveKey(publicKey: string): Buffer {
  const hash = crypto.createHash("sha256");
  hash.update(publicKey);
  return Buffer.from(hash.digest());
}

/**
 * Validate that an object contains only string values.
 */
function isStringRecord(obj: any): obj is Record<string, string> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Object.values(obj).every((v) => typeof v === "string")
  );
}

/**
 * Encryption helpers (AES‑256‑GCM)
 */
const ALGORITHM = "aes-256-gcm";

/**
 * Encrypt a JSON‑serializable object with the given key and return a base64 string.
 */
function encrypt<T>(data: T, key: Buffer): string {
  try {
    const json = JSON.stringify(data);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Concatenate iv, ciphertext, and tag, then base64‑encode
    return Buffer.concat([iv, encrypted, tag]).toString("base64");
  } catch (e) {
    log("Encryption error:", e);
    throw e;
  }
}

/**
 * Decrypt a base64 string produced by `encrypt` and return the original object.
 */
function decrypt<T>(encryptedBase64: string, key: Buffer): T {
  try {
    const data = Buffer.from(encryptedBase64, "base64");
    const iv = data.slice(0, 12);
    const tag = data.slice(data.length - 16);
    const encrypted = data.slice(12, -16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString()) as T;
  } catch (e) {
    log("Decryption error:", e);
    throw e;
  }
}

/**
 * Main socket setup function.
 */
export function setupSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    log("🔌 Enterprise socket connected:", socket.id);

    // -------------------------------------------------------------------------
    // User Session Initialization
    // -------------------------------------------------------------------------
    socket.on("join", (data: JoinData) => {
      try {
        const room = data.room || "general";
        const status = (data.status as keyof typeof UserStatus) || UserStatus.ONLINE;

        // Basic validation
        if (!data.username || !data.publicKey) {
          socket.emit("error", { message: "Invalid join payload" });
          return;
        }

        // Derive a symmetric key from the public key
        const encKey = deriveKey(data.publicKey);

        const activeUser: ActiveUser = {
          userId: data.userId,
          username: data.username,
          publicKey: data.publicKey,
          socketId: socket.id,
          currentRoom: room,
          status,
          encKey,
        };

        activeSockets.set(socket.id, activeUser);
        socket.join(room);

        log(`👤 ${data.username} connected (${socket.id}) -> room [${room}]`);

        // Notify others in the room
        socket.to(room).emit("user_joined", {
          userId: data.userId,
          username: data.username,
          publicKey: data.publicKey,
          socketId: socket.id,
          status,
          room,
        });

        // Send active users list to the newly connected socket
        const activeList = Array.from(activeSockets.values());
        socket.emit("existing_users", activeList);
        io.emit("presence_update", activeList);
      } catch (err) {
        log("Error handling join:", err);
        socket.emit("error", { message: "Join failed" });
      }
    });

    // -------------------------------------------------------------------------
    // Room Switch Handler
    // -------------------------------------------------------------------------
    socket.on("switch_room", (newRoom: string) => {
      try {
        const user = activeSockets.get(socket.id);
        if (!user) return;

        socket.leave(user.currentRoom);
        user.currentRoom = newRoom;
        socket.join(newRoom);

        const roomUsers = Array.from(activeSockets.values()).filter(
          (u) => u.currentRoom === newRoom
        );
        socket.emit("existing_users", roomUsers);

        socket.to(newRoom).emit("user_joined", {
          userId: user.userId,
          username: user.username,
          publicKey: user.publicKey,
          socketId: socket.id,
          status: user.status,
          room: newRoom,
        });

        log(`🔀 ${user.username} switched to room ${newRoom}`);
      } catch (err) {
        log("Error handling switch_room:", err);
        socket.emit("error", { message: "Room switch failed" });
      }
    });

    // -------------------------------------------------------------------------
    // Presence Status Update (Online, Away, DND, Offline)
    // -------------------------------------------------------------------------
    socket.on("update_status", (status: keyof typeof UserStatus) => {
      try {
        const user = activeSockets.get(socket.id);
        if (!user) return;

        user.status = UserStatus[status.toUpperCase() as keyof typeof UserStatus];
        io.emit("presence_update", Array.from(activeSockets.values()));
        log(`🔔 ${user.username} set status to ${user.status}`);
      } catch (err) {
        log("Error handling update_status:", err);
        socket.emit("error", { message: "Status update failed" });
      }
    });

    // -------------------------------------------------------------------------
    // Send Encrypted Message Payload
    // -------------------------------------------------------------------------
    socket.on("send_message", (data: SendMessageData) => {
      try {
        // Rate limiting
        const now = Date.now();
        const timestamps = messageTimestamps.get(socket.id) ?? [];
        const recent = timestamps.filter((t) => now - t < MESSAGE_WINDOW_MS);
        recent.push(now);
        messageTimestamps.set(socket.id, recent);
        if (recent.length > MESSAGE_LIMIT) {
          socket.emit("error", { message: "Message rate limit exceeded" });
          return;
        }

        // Basic payload validation
        if (!data.author || !isStringRecord(data.payloads)) {
          socket.emit("error", { message: "Invalid message payload" });
          return;
        }

        // Retrieve the user's encryption key
        const user = activeSockets.get(socket.id);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }
        const userKey = user.encKey;

        // *** E2EE ENCRYPTION ***
        // Encrypt the payloads before storage and broadcasting
        const encryptedPayloads = encrypt(data.payloads, userKey);
        const messageBroadcast = {
          ...data,
          payloads: encryptedPayloads,
        };

        const msgId = "msg_" + Math.random().toString(36).substring(2, 12);
        const roomId = data.roomId || "general";
        const timeStr =
          data.time ||
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        // Persist to SQLite
        try {
          const stmt = db.prepare(`
            INSERT INTO messages (id, room_id, sender_id, sender_username, payloads, media_url, file_name, file_size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            msgId,
            roomId,
            data.senderId || "anon",
            data.author,
            JSON.stringify(encryptedPayloads), // store encrypted payloads as JSON string
            data.mediaUrl || null,
            data.fileName || null,
            data.fileSize || null
          );
        } catch (dbErr) {
          log("SQLite message insertion error:", dbErr);
        }

        io.to(roomId).emit("receive_message", messageBroadcast);
        log(`💬 Message ${msgId} sent to room ${roomId} by ${data.author}`);
      } catch (err) {
        log("Error handling send_message:", err);
        socket.emit("error", { message: "Message send failed" });
      }
    });

    // -------------------------------------------------------------------------
    // Message Deletion
    // -------------------------------------------------------------------------
    socket.on("delete_message", (data: DeleteMessageData) => {
      try {
        const stmt = db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?");
        stmt.run(data.messageId);
        io.to(data.roomId).emit("message_deleted", { messageId: data.messageId });
        log(`🗑️ Message ${data.messageId} deleted in room ${data.roomId}`);
      } catch (err) {
        log("Failed deleting message:", err);
        socket.emit("error", { message: "Message deletion failed" });
      }
    });

    // -------------------------------------------------------------------------
    // Typing Indicators
    // -------------------------------------------------------------------------
    socket.on("typing_start", (data: TypingData) => {
      socket.to(data.roomId).emit("user_typing", {
        username: data.username,
        roomId: data.roomId,
        isTyping: true,
      });
    });

    socket.on("typing_stop", (data: TypingData) => {
      socket.to(data.roomId).emit("user_typing", {
        username: data.username,
        roomId: data.roomId,
        isTyping: false,
      });
    });

    // -------------------------------------------------------------------------
    // Reactions
    // -------------------------------------------------------------------------
    socket.on("add_reaction", (data: ReactionData) => {
      io.to(data.roomId).emit("message_reaction", data);
    });

    // -------------------------------------------------------------------------
    // Disconnect handling
    // -------------------------------------------------------------------------
    socket.on("disconnect", () => {
      const user = activeSockets.get(socket.id);
      if (user) {
        activeSockets.delete(socket.id);
        io.to(user.currentRoom).emit("user_left", {
          username: user.username,
          socketId: socket.id,
          userId: user.userId,
        });
        io.emit("presence_update", Array.from(activeSockets.values()));
        log(`❌ Socket ${socket.id} (${user.username}) disconnected`);
      } else {
        log(`❌ Socket ${socket.id} disconnected (no user record)`);
      }
      // Clean up rate‑limiter data
      messageTimestamps.delete(socket.id);
    });

    // -------------------------------------------------------------------------
    // Generic error handling for unexpected exceptions
    // -------------------------------------------------------------------------
    socket.on("error", (err) => {
      log("Socket error:", err);
    });
  });
}

/**
 * In‑memory map tracking active sockets and their associated user data.
 */
const activeSockets = new Map<string, ActiveUser>();
