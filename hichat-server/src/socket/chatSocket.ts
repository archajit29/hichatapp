import { Server, Socket } from "socket.io";
import { AuthService, RoomService, MessageService, PresenceService } from "../services";
import { config } from "../core/config";
import { logger, getScopedLogger } from "../core/logger";
import { requestContext } from "../core/context";
import { isDatabaseReady } from "../db/db";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  CryptoError,
  DatabaseError,
  RateLimitError,
} from "../core/errors";
import {
  socketJoinSchema,
  socketSendDirectMessageSchema,
  socketAckDirectMessageSchema,
  socketReadDirectMessageSchema,
  socketResumeDeliverySchema,
  socketHeartbeatSchema,
  socketUpdateStatusSchema,
  socketGetUserPresenceSchema,
} from "../validation";
import { validateSocket } from "../middleware/validation";

/**
 * Standardized Socket.IO Error Dispatcher (Phase 11.2)
 * Emits uniform structured JSON:
 * {
 *   success: false,
 *   error: {
 *     code: string,
 *     message: string,
 *     requestId: string
 *   }
 * }
 */
export interface SocketErrorOptions {
  cause?: unknown;
  code?: string;
  eventName?: string;
}

/**
 * Standardized Socket.IO Error Dispatcher with Cause Chaining (Phase 11.3)
 * Emits uniform structured JSON:
 * {
 *   success: false,
 *   error: {
 *     code: string,
 *     message: string,
 *     requestId: string
 *   }
 * }
 */
export function emitSocketError(
  socket: Socket,
  err: AppError | Error | string,
  optionsOrCode?: SocketErrorOptions | string,
  legacyEventName?: string
) {
  const isOptionsObj = optionsOrCode && typeof optionsOrCode === "object";
  const customCode = isOptionsObj ? optionsOrCode.code : (typeof optionsOrCode === "string" ? optionsOrCode : undefined);
  const customCause = isOptionsObj ? optionsOrCode.cause : undefined;
  const eventName = isOptionsObj ? (optionsOrCode.eventName || "socket_error") : (legacyEventName || "socket_error");

  const requestId =
    socket.data?.requestId ||
    `sock_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  const sockLogger = socket.data?.logger || logger;

  let code = customCode || "INTERNAL_SERVER_ERROR";
  let message = "An internal socket error occurred";
  let statusCode = 500;
  let errorObj: any = err;

  if (typeof err === "string") {
    message = err;
    code = customCode || "SOCKET_ERROR";
    errorObj = new AppError(message, 400, code, true, customCause ? { cause: customCause } : undefined);
  } else if (err instanceof AppError) {
    code = customCode || err.code;
    message = err.message;
    statusCode = err.statusCode;
    if (customCause && !err.cause) {
      (err as any).cause = customCause;
    }
  } else if (err instanceof Error) {
    message = err.message;
    code = customCode || "SOCKET_ERROR";
    if (customCause && !err.cause) {
      (err as any).cause = customCause;
    }
  }

  // Extract cause chain from error or helper
  let causeChain: Array<{ name: string; message: string; stack?: string }> = [];
  if (typeof errorObj?.getCauseChain === "function") {
    causeChain = errorObj.getCauseChain();
  } else if (errorObj?.cause) {
    let current = errorObj.cause;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current instanceof Error) {
        causeChain.push({ name: current.name || "Error", message: current.message, stack: current.stack });
        current = (current as any).cause;
      } else {
        causeChain.push({ name: "UnknownCause", message: typeof current === "object" ? JSON.stringify(current) : String(current) });
        break;
      }
    }
  }

  const rootCause = typeof errorObj?.getRootCause === "function"
    ? errorObj.getRootCause()
    : (causeChain.length > 0 ? causeChain[causeChain.length - 1] : errorObj?.cause);

  const logData: Record<string, any> = {
    err: errorObj,
    stack: errorObj?.stack,
    code,
    statusCode,
    requestId,
    socketId: socket.id,
    userId: socket.data?.user?.userId,
    username: socket.data?.user?.username,
    module: "socket",
  };

  if (causeChain && causeChain.length > 0) {
    logData.causeChain = causeChain;
  }
  if (rootCause) {
    logData.rootCause = rootCause instanceof Error
      ? { name: rootCause.name, message: rootCause.message, stack: rootCause.stack }
      : rootCause;
  }

  if (statusCode >= 500) {
    sockLogger.error(logData, `💥 [${code}] Socket error on ${socket.id}: ${message}`);
  } else {
    sockLogger.warn(logData, `⚠️ [${code}] Socket error on ${socket.id}: ${message}`);
  }

  // Strictly emit only { success: false, error: { code, message, requestId } } to clients
  const payload = {
    success: false,
    error: {
      code,
      message,
      requestId,
    },
  };

  if (eventName && eventName !== "error") {
    socket.emit(eventName, payload);
  }
  socket.emit("error", payload);
  return payload;
}

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
 * Payload definitions for socket events.
 */
interface JoinData {
  userId?: string;
  username?: string;
  publicKey: string;
  room?: string;
  status?: keyof typeof UserStatus;
  lastAckedMessageId?: string;
}

interface SwitchRoomData {
  newRoom: string;
}

interface UpdateStatusData {
  status: keyof typeof UserStatus;
  customStatus?: string;
}

interface SendMessageData {
  roomId: string;
  senderId?: string;
  author: string;
  payloads: Record<string, any>;
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
 * Helper to log with Pino logger.
 */
function log(msg: string, ...meta: any[]) {
  if (meta.length > 0 && typeof meta[0] === "object") {
    logger.info({ module: "socket", ...meta[0] }, msg);
  } else if (meta.length > 0) {
    logger.info({ module: "socket", meta }, msg);
  } else {
    logger.info({ module: "socket" }, msg);
  }
}

/**
 * Validate that an object is a record of payloads.
 */
function isPayloadRecord(obj: any): obj is Record<string, any> {
  return typeof obj === "object" && obj !== null;
}

/**
 * Emits an event to all active device sockets belonging to a user (Multi-Device & Pub/Sub aware).
 */
async function emitToUser(io: Server, userId: string, event: string, payload: any): Promise<number> {
  const sockets = await PresenceService.getUserSockets(userId);
  for (const socketId of sockets) {
    io.to(socketId).emit(event, payload);
  }
  return sockets.length;
}

// Bounded in-memory cache of recently delivered message IDs for post-purge deduplication
const RECENT_DELIVERED_CACHE_LIMIT = 5000;
const recentDeliveredMessageIds = new Set<string>();

function markMessageDelivered(messageId: string) {
  if (recentDeliveredMessageIds.size >= RECENT_DELIVERED_CACHE_LIMIT) {
    const firstKey = recentDeliveredMessageIds.values().next().value;
    if (firstKey) recentDeliveredMessageIds.delete(firstKey);
  }
  recentDeliveredMessageIds.add(messageId);
}

// Map of in-flight message delivery ACK timers: messageId -> { timer, mailboxId, recipientId, senderId }
const inFlightAckTimers = new Map<string, {
  timer: NodeJS.Timeout;
  mailboxId: number;
  messageId: string;
  recipientId: string;
  senderId: string;
}>();

const ACK_TIMEOUT_MS = 5000;

let retrySweepInterval: NodeJS.Timeout | null = null;
let presenceCleanupInterval: NodeJS.Timeout | null = null;
let isSweepRunning = false;

function clearAckTimer(messageId: string) {
  const existing = inFlightAckTimers.get(messageId);
  if (existing) {
    clearTimeout(existing.timer);
    inFlightAckTimers.delete(messageId);
  }
}

function armAckTimer(
  io: Server,
  data: {
    mailboxId: number;
    messageId: string;
    recipientId: string;
    senderId: string;
  }
) {
  clearAckTimer(data.messageId);

  const timer = setTimeout(async () => {
    inFlightAckTimers.delete(data.messageId);

    try {
      if (!isDatabaseReady()) return;
      const result = await MessageService.handleAckTimeout(data.mailboxId, data.messageId);

      if (result.failed) {
        logger.warn(
          {
            module: "mailbox-retry",
            messageId: data.messageId,
            recipientId: data.recipientId,
            attemptCount: result.attemptCount,
            finalFailureReason: result.reason,
          },
          `💀 Delivery exhausted max retries (${result.attemptCount}) for message ${data.messageId} - marked as failed`
        );

        await emitToUser(io, data.senderId, "message_status_update", {
          messageId: data.messageId,
          status: "failed",
          recipientId: data.recipientId,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.info(
          {
            module: "mailbox-retry",
            messageId: data.messageId,
            recipientId: data.recipientId,
            attemptCount: result.attemptCount,
            nextRetryAt: result.nextRetryAt,
          },
          `⏱️ ACK timeout for message ${data.messageId} - scheduled retry at ${result.nextRetryAt}`
        );

        await emitToUser(io, data.senderId, "message_status_update", {
          messageId: data.messageId,
          status: "queued",
          timeout: true,
          recipientId: data.recipientId,
          nextRetryAt: result.nextRetryAt,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      log("Error during ACK timeout handling:", err);
    }
  }, ACK_TIMEOUT_MS);

  inFlightAckTimers.set(data.messageId, {
    timer,
    mailboxId: data.mailboxId,
    messageId: data.messageId,
    recipientId: data.recipientId,
    senderId: data.senderId,
  });
}

async function resolveUserId(identifier: string): Promise<string | null> {
  return await AuthService.resolveUserId(identifier);
}

/**
 * Flushes all pending mailbox messages for a connecting user in strict chronological send-order.
 * Supports resumption from lastAcknowledgedMessageId.
 * Note: Does NOT delete rows here. Rows are deleted ONLY as individual acks arrive.
 */
async function deliverPendingMailbox(io: Server, socket: Socket, userId: string, lastAckedMessageId?: string): Promise<any[]> {
  try {
    if (!isDatabaseReady()) return [];

    const pendingMessages = lastAckedMessageId
      ? await MessageService.getPendingMailboxSince(userId, lastAckedMessageId)
      : await MessageService.getPendingMailbox(userId);

    if (pendingMessages && pendingMessages.length > 0) {
      const sockLogger = socket.data?.logger || logger;
      sockLogger.info(
        { userId, pendingCount: pendingMessages.length, lastAckedMessageId },
        `📬 Replaying ${pendingMessages.length} queued mailbox message(s) in send-order`
      );

      for (const msg of pendingMessages) {
        const nextDelayMs = MessageService.calculateRetryDelay(2);
        const attemptInfo = await MessageService.incrementAttempt(msg.message_id, nextDelayMs);
        await MessageService.markMailboxDelivered(msg.id, msg.message_id);

        logger.info({
          module: "mailbox-retry",
          requestId: socket.data?.requestId,
          messageId: msg.message_id,
          recipientId: userId,
          attemptCount: attemptInfo.attemptCount,
          nextRetryAt: attemptInfo.nextRetryAt,
        }, `📤 Replay delivery attempt ${attemptInfo.attemptCount} for message ${msg.message_id} to ${userId}`);

        socket.emit("receive_direct_message", {
          mailboxId: msg.id,
          messageId: msg.message_id,
          senderId: msg.sender_id,
          senderUsername: msg.sender_username,
          ciphertext: msg.ciphertext,
          timestamp: msg.created_at,
          status: "delivered",
          requestId: socket.data?.requestId,
        });

        // Notify sender that message was delivered
        await emitToUser(io, msg.sender_id, "message_status_update", {
          messageId: msg.message_id,
          status: "delivered",
          recipientId: userId,
          timestamp: new Date().toISOString(),
          requestId: socket.data?.requestId,
        });

        // Arm ACK timeout
        armAckTimer(io, {
          mailboxId: msg.id,
          messageId: msg.message_id,
          recipientId: userId,
          senderId: msg.sender_id,
        });
      }
    }
    return pendingMessages || [];
  } catch (err: any) {
    logger.error({ err, stack: err?.stack, userId }, "Error flushing pending mailbox");
    return [];
  }
}

/**
 * Periodic Sweep: Re-dispatches unacknowledged mailbox messages using exponential backoff retry scheduling (Phase 13D.1).
 * Features:
 *  - 5000ms default interval (configurable via config.mailbox.retryIntervalMs).
 *  - Singleton lifecycle (guaranteed single active timer).
 *  - Concurrency guard to skip overlapping ticks if a sweep is already running.
 *  - Zero log spam on empty sweeps.
 */
export function startMailboxRetrySweep(io: Server): NodeJS.Timeout {
  if (retrySweepInterval) {
    clearInterval(retrySweepInterval);
    retrySweepInterval = null;
  }

  const intervalMs = config.mailbox?.retryIntervalMs || 5000;

  retrySweepInterval = setInterval(async () => {
    // 1. Guard against uninitialized database
    if (!isDatabaseReady()) return;

    // 2. Prevent overlapping execution ticks
    if (isSweepRunning) {
      logger.debug({ module: "mailbox-retry" }, "Skipping mailbox retry sweep tick: previous sweep still in-flight");
      return;
    }

    isSweepRunning = true;
    try {
      const onlineUsers = await PresenceService.getOnlineUsers();
      const onlineUserIds = new Set<string>(onlineUsers.map((u) => u.userId));

      const { failedMessages, retryDispatches } = await MessageService.processRetryQueue(onlineUserIds);

      // Only log if there are actions taken (dispatches or dead-letters)
      if (failedMessages.length > 0 || retryDispatches.length > 0) {
        logger.info(
          {
            module: "mailbox-retry",
            failedCount: failedMessages.length,
            dispatchCount: retryDispatches.length,
          },
          `📬 Mailbox retry sweep processed: ${retryDispatches.length} retries dispatched, ${failedMessages.length} dead-lettered`
        );
      }

      // Notify senders of exhausted dead-letter messages
      for (const failed of failedMessages) {
        logger.warn({
          module: "mailbox-retry",
          messageId: failed.messageId,
          recipientId: failed.recipientId,
          attemptCount: failed.attemptCount,
          finalFailureReason: failed.reason,
        }, `💀 Message ${failed.messageId} failed after max retry exhaustion`);

        await emitToUser(io, failed.senderId, "message_status_update", {
          messageId: failed.messageId,
          status: "failed",
          recipientId: failed.recipientId,
          timestamp: new Date().toISOString(),
        });
      }

      // Dispatch retries to online recipients across any connected container/device
      for (const item of retryDispatches) {
        const recipientSockets = await PresenceService.getUserSockets(item.recipientId);
        if (recipientSockets.length > 0) {
          logger.info({
            module: "mailbox-retry",
            messageId: item.messageId,
            recipientId: item.recipientId,
            attemptCount: item.attemptCount,
            nextRetryAt: item.nextRetryAt,
          }, `🔄 Dispatched retry attempt ${item.attemptCount} for message ${item.messageId}`);

          for (const socketId of recipientSockets) {
            io.to(socketId).emit("receive_direct_message", {
              mailboxId: item.mailboxId,
              messageId: item.messageId,
              senderId: item.senderId,
              senderUsername: item.senderUsername,
              ciphertext: item.ciphertext,
              timestamp: item.timestamp,
              status: "delivered",
              isRetry: true,
            });
          }

          await emitToUser(io, item.senderId, "message_status_update", {
            messageId: item.messageId,
            status: "delivered",
            recipientId: item.recipientId,
            isRetry: true,
            timestamp: new Date().toISOString(),
          });

          armAckTimer(io, {
            mailboxId: item.mailboxId,
            messageId: item.messageId,
            recipientId: item.recipientId,
            senderId: item.senderId,
          });
        }
      }
    } catch (err: any) {
      logger.error({ err, stack: err?.stack }, "Error in mailbox retry sweep");
    } finally {
      isSweepRunning = false;
    }
  }, intervalMs);

  logger.info({ intervalMs }, `🕒 Mailbox retry scheduler initialized (interval: ${intervalMs}ms)`);
  return retrySweepInterval;
}

export function stopMailboxRetrySweep() {
  if (retrySweepInterval) {
    clearInterval(retrySweepInterval);
    retrySweepInterval = null;
  }
}

/**
 * Periodic Redis Presence Garbage Collector Scheduler (Phase 13E Part 6).
 * Automatically sweeps orphan sockets and expired presence records every 60 seconds.
 */
export function startPresenceCleanupScheduler(io: Server) {
  if (presenceCleanupInterval) {
    clearInterval(presenceCleanupInterval);
    presenceCleanupInterval = null;
  }

  presenceCleanupInterval = setInterval(async () => {
    try {
      const { expiredUsers, cleanedSockets } = await PresenceService.cleanupExpiredPresence();
      if (expiredUsers.length > 0 || cleanedSockets.length > 0) {
        const onlineUsers = await PresenceService.getOnlineUsers();
        io.emit("presence_update", onlineUsers);

        for (const expiredUserId of expiredUsers) {
          io.emit("user_presence", { userId: expiredUserId, online: false });
        }
      }
    } catch (err: any) {
      logger.error({ err, stack: err?.stack }, "Error during Redis presence cleanup sweep");
    }
  }, 60000);

  logger.info("🧹 Redis presence cleanup scheduler started (interval: 60s)");
  return presenceCleanupInterval;
}

export function stopPresenceCleanupScheduler() {
  if (presenceCleanupInterval) {
    clearInterval(presenceCleanupInterval);
    presenceCleanupInterval = null;
  }
}

export function startSocketSchedulers(io: Server) {
  startMailboxRetrySweep(io);
  startPresenceCleanupScheduler(io);
  logger.info("🕒 Socket retry and Redis presence schedulers started successfully");
}

export function stopSocketSchedulers() {
  stopMailboxRetrySweep();
  stopPresenceCleanupScheduler();
  for (const item of inFlightAckTimers.values()) {
    clearTimeout(item.timer);
  }
  inFlightAckTimers.clear();
  logger.info("🛑 Socket retry and presence schedulers stopped gracefully");
}

export function getSchedulerState() {
  return {
    isRetrySweepActive: retrySweepInterval !== null,
    isPresenceCleanupActive: presenceCleanupInterval !== null,
    retryIntervalMs: config.mailbox?.retryIntervalMs || 5000,
    isSweepRunning,
  };
}

/**
 * Main socket setup function.
 */
export function setupSocket(io: Server) {
  // ---------------------------------------------------------------------------
  // Mandatory Socket Connection Authentication Middleware (JWT & Request ID)
  // ---------------------------------------------------------------------------
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.split(" ")[1]
          : null);

      const requestId =
        socket.handshake.auth?.requestId ||
        socket.handshake.headers["x-request-id"] ||
        `sock_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

      socket.data.requestId = requestId;

      if (!token) {
        logger.warn({ requestId, socketId: socket.id }, "Socket connection rejected: Missing token");
        const authErr = new AuthenticationError("Authentication token is required");
        (authErr as any).data = {
          success: false,
          error: {
            code: authErr.code,
            message: authErr.message,
            requestId,
          },
        };
        return next(authErr);
      }

      const decoded = AuthService.verifyToken(token);
      if (!decoded || !decoded.id || !decoded.username) {
        logger.warn({ requestId, socketId: socket.id }, "Socket connection rejected: Invalid or expired token");
        const authErr = new AuthenticationError("Invalid or expired authentication token");
        (authErr as any).data = {
          success: false,
          error: {
            code: authErr.code,
            message: authErr.message,
            requestId,
          },
        };
        return next(authErr);
      }

      // Attach cryptographically verified identity & scoped logger
      socket.data.user = {
        userId: decoded.id,
        username: decoded.username,
        email: decoded.email
      };
      socket.data.mailboxFlushed = false;
      socket.data.logger = getScopedLogger({
        requestId,
        socketId: socket.id,
        userId: decoded.id,
        username: decoded.username,
        module: "socket"
      });

      next();
    } catch (err: any) {
      logger.error({ err, stack: err?.stack, socketId: socket.id }, "Socket authentication verification exception");
      const authErr = new AuthenticationError("Authentication verification failed", { cause: err });
      (authErr as any).data = {
        success: false,
        error: {
          code: authErr.code,
          message: authErr.message,
          requestId: socket.data?.requestId || `sock_${Date.now().toString(36)}`,
        },
      };
      return next(authErr);
    }
  });

  io.on("connection", (socket: Socket) => {
    const authUser = socket.data.user;
    const sockLogger = socket.data.logger || logger;
    sockLogger.info({ socketId: socket.id, username: authUser?.username }, `🔌 Enterprise socket connected (${authUser?.username})`);

    // Wrap incoming socket events in requestContext for query logging correlation
    socket.use(([event, ...args], next) => {
      requestContext.run({
        requestId: socket.data.requestId,
        userId: authUser?.userId,
        username: authUser?.username,
        socketId: socket.id,
        module: "socket"
      }, () => {
        next();
      });
    });

    // -------------------------------------------------------------------------
    // User Session Initialization & Distributed Presence (Phase 13E & 14A)
    // -------------------------------------------------------------------------
    socket.on("join", async (rawData: any) => {
      try {
        if (!authUser?.userId || !authUser?.username) {
          return emitSocketError(socket, new AuthenticationError("Unauthorized socket session"), "AUTHENTICATION_ERROR");
        }

        const val = validateSocket(socketJoinSchema, rawData, socket);
        if (!val.success || !val.data) return;
        const data = val.data;

        const room = data.room || "general";
        if (room !== "general") {
          const roomRow = await RoomService.getRoom(room);
          if (!roomRow) {
            return emitSocketError(socket, new NotFoundError(`Room '${room}' does not exist`), "NOT_FOUND");
          }
        }

        const status = data.status || "online";

        // Register presence in Redis (supports multi-device connections)
        const { isFirstSocket, socketCount } = await PresenceService.markOnline(
          authUser.userId,
          socket.id,
          {
            username: authUser.username,
            status,
            room,
            publicKey: data.publicKey,
          }
        );

        socket.join(room);

        log(`👤 ${authUser.username} connected (${socket.id}) -> room [${room}] (Devices: ${socketCount})`);

        // Notify room presence
        socket.to(room).emit("user_joined", {
          userId: authUser.userId,
          username: authUser.username,
          publicKey: data.publicKey,
          socketId: socket.id,
          status,
          room,
        });

        // Flush pending mailbox messages once per socket connection in strict send-order
        if (!socket.data.mailboxFlushed) {
          socket.data.mailboxFlushed = true;
          await deliverPendingMailbox(io, socket, authUser.userId, data.lastAckedMessageId || data.lastAcknowledgedMessageId);
        }

        const onlineUsers = await PresenceService.getOnlineUsers();
        socket.emit("existing_users", onlineUsers);
        socket.emit("online_users", onlineUsers);
        io.emit("presence_update", onlineUsers);
        io.emit("user_presence", {
          userId: authUser.userId,
          username: authUser.username,
          status,
          online: true,
          socketCount,
        });
      } catch (err) {
        log("Error handling join:", err);
        emitSocketError(socket, new AppError("Join failed", 500, "JOIN_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Redis Presence Heartbeat (Every 30s)
    // -------------------------------------------------------------------------
    socket.on("heartbeat", async (rawData?: any) => {
      try {
        if (!authUser?.userId) return;
        const val = validateSocket(socketHeartbeatSchema, rawData || {}, socket);
        if (!val.success) return;

        await PresenceService.heartbeat(authUser.userId, socket.id);
        socket.emit("heartbeat_ack", { timestamp: new Date().toISOString() });
      } catch (err) {
        log("Error processing heartbeat:", err);
      }
    });

    // -------------------------------------------------------------------------
    // Online Users Listing Query
    // -------------------------------------------------------------------------
    socket.on("get_online_users", async (_data?: any, callback?: (users: any[]) => void) => {
      try {
        const onlineUsers = await PresenceService.getOnlineUsers();
        if (typeof callback === "function") {
          callback(onlineUsers);
        } else {
          socket.emit("online_users", onlineUsers);
        }
      } catch (err) {
        log("Error getting online users:", err);
      }
    });

    socket.on("online_users", async (_data?: any, callback?: (users: any[]) => void) => {
      try {
        const onlineUsers = await PresenceService.getOnlineUsers();
        if (typeof callback === "function") {
          callback(onlineUsers);
        } else {
          socket.emit("online_users", onlineUsers);
        }
      } catch (err) {
        log("Error getting online users:", err);
      }
    });

    // -------------------------------------------------------------------------
    // Single User Presence Query
    // -------------------------------------------------------------------------
    socket.on("get_user_presence", async (rawData: any, callback?: (presence: any) => void) => {
      try {
        const val = validateSocket(socketGetUserPresenceSchema, rawData, socket, callback);
        if (!val.success || !val.data) return;
        const data = val.data;

        const presence = await PresenceService.getPresence(data.userId);
        if (typeof callback === "function") {
          callback(presence);
        } else {
          socket.emit("user_presence_response", presence);
        }
      } catch (err) {
        log("Error querying user presence:", err);
      }
    });

    // -------------------------------------------------------------------------
    // Mailbox Resumption / Synchronization Handler
    // -------------------------------------------------------------------------
    socket.on("resume_delivery", async (rawData: any, callback?: (res: { success: boolean; count: number }) => void) => {
      try {
        if (!authUser?.userId) {
          return emitSocketError(socket, new AuthenticationError("Unauthorized socket session"), "AUTHENTICATION_ERROR");
        }

        const val = validateSocket(socketResumeDeliverySchema, rawData, socket, callback);
        if (!val.success || !val.data) return;
        const data = val.data;

        const replayed = await deliverPendingMailbox(io, socket, authUser.userId, data.lastAcknowledgedMessageId);
        const count = Array.isArray(replayed) ? replayed.length : 0;

        if (typeof callback === "function") {
          callback({ success: true, count });
        } else {
          socket.emit("resume_delivery_response", { success: true, count });
        }
      } catch (err) {
        log("Error in resume_delivery:", err);
        emitSocketError(socket, new AppError("Resume delivery failed", 500, "RESUME_DELIVERY_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Direct Message Sender Handler (Guaranteed Mailbox Write + Live Dispatch)
    // -------------------------------------------------------------------------
    socket.on("send_direct_message", async (rawData: any) => {
      try {
        if (!authUser?.userId || !authUser?.username) {
          return emitSocketError(socket, new AuthenticationError("Unauthorized socket session"), "AUTHENTICATION_ERROR");
        }

        const val = validateSocket(socketSendDirectMessageSchema, rawData, socket);
        if (!val.success || !val.data) return;
        const data = val.data;

        const { recipientId, messageId, ciphertext } = data;

        // Deduplication against recently delivered and purged messages
        if (recentDeliveredMessageIds.has(messageId)) {
          log(`🔁 Message ${messageId} already delivered. Acknowledging retry.`);
          socket.emit("message_sent_ack", { messageId, status: "already_delivered", duplicate: true });
          return socket.emit("message_status_update", {
            messageId,
            status: "acknowledged",
            recipientId,
            duplicate: true,
            timestamp: new Date().toISOString()
          });
        }

        // Check if messageId already exists in delivery records
        const existingDelivery = await MessageService.getDeliveryRecord(messageId);
        if (existingDelivery && (existingDelivery.status === "acknowledged" || existingDelivery.status === "read")) {
          log(`🔁 Message ${messageId} already recorded as ${existingDelivery.status}. Acknowledging retry.`);
          socket.emit("message_sent_ack", { messageId, status: "already_delivered", duplicate: true });
          return socket.emit("message_status_update", {
            messageId,
            status: existingDelivery.status,
            recipientId,
            duplicate: true,
            timestamp: new Date().toISOString()
          });
        }

        // Guaranteed baseline: persist to mailbox through MessageService
        let queueResult: { mailboxId: number; canonicalRecipientId: string; serializedCiphertext: string };
        try {
          queueResult = await MessageService.queueDirectMessage({
            messageId,
            recipientId,
            senderId: authUser.userId,
            senderUsername: authUser.username,
            ciphertext,
          });
        } catch (dbErr: any) {
          if (dbErr.message && (dbErr.message.includes("UNIQUE constraint failed") || dbErr.message.includes("duplicate key"))) {
            log(`🔁 Duplicate message_id ${messageId} pending in mailbox. Safe retry acknowledged.`);
            return socket.emit("message_sent_ack", { messageId, status: "queued_mailbox", duplicate: true });
          }
          log("Mailbox insertion error:", dbErr);
          return emitSocketError(socket, new DatabaseError("Failed to persist message in mailbox", { cause: dbErr }), "DATABASE_ERROR");
        }

        const { mailboxId, canonicalRecipientId, serializedCiphertext } = queueResult;

        socket.emit("message_sent_ack", { messageId, status: "queued_mailbox", mailboxId });
        socket.emit("message_status_update", {
          messageId,
          status: "queued",
          recipientId: canonicalRecipientId,
          timestamp: new Date().toISOString()
        });

        // Dispatch to recipient device sockets if recipient is online in Redis
        const recipientSockets = await PresenceService.getUserSockets(canonicalRecipientId);
        if (recipientSockets.length > 0) {
          const nextDelayMs = MessageService.calculateRetryDelay(2);
          const attemptInfo = await MessageService.incrementAttempt(messageId, nextDelayMs);
          await MessageService.markMailboxDelivered(mailboxId, messageId);

          logger.info({
            module: "mailbox-retry",
            requestId: socket.data?.requestId,
            messageId,
            recipientId: canonicalRecipientId,
            attemptCount: attemptInfo.attemptCount,
            nextRetryAt: attemptInfo.nextRetryAt,
          }, `📤 Initial delivery attempt ${attemptInfo.attemptCount} for message ${messageId} to ${canonicalRecipientId}`);

          for (const sId of recipientSockets) {
            io.to(sId).emit("receive_direct_message", {
              mailboxId,
              messageId,
              senderId: authUser.userId,
              senderUsername: authUser.username,
              ciphertext: serializedCiphertext,
              timestamp: new Date().toISOString(),
              status: "delivered"
            });
          }

          socket.emit("message_status_update", {
            messageId,
            status: "delivered",
            recipientId: canonicalRecipientId,
            timestamp: new Date().toISOString()
          });

          // Arm ACK timeout
          armAckTimer(io, {
            mailboxId,
            messageId,
            recipientId: canonicalRecipientId,
            senderId: authUser.userId,
          });

          log(`⚡ Live dispatch for message ${messageId} (mailboxId: ${mailboxId}) to ${canonicalRecipientId} (${recipientSockets.length} devices)`);
        } else {
          log(`📬 Message ${messageId} (mailboxId: ${mailboxId}) queued in mailbox for offline recipient ${canonicalRecipientId}`);
        }
      } catch (err) {
        log("Error handling send_direct_message:", err);
        emitSocketError(socket, new AppError("Message processing failed", 500, "MESSAGE_PROCESSING_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Direct Message Acknowledgment Handler (Purges mailbox row ONLY after client receipt)
    // -------------------------------------------------------------------------
    socket.on("ack_direct_message", async (rawData: any) => {
      try {
        if (!authUser?.userId) {
          return emitSocketError(socket, new AuthenticationError("Unauthorized socket session"), "AUTHENTICATION_ERROR");
        }

        const val = validateSocket(socketAckDirectMessageSchema, rawData, socket);
        if (!val.success || !val.data) return;
        const data = val.data;

        // Clear active ACK timer
        clearAckTimer(data.messageId);

        const ackRes = await MessageService.acknowledgeDirectMessage(
          authUser.userId,
          data.messageId,
          data.mailboxId
        );
        const senderId = ackRes?.senderId;

        markMessageDelivered(data.messageId);

        // Notify sender socket with acknowledged state
        if (senderId) {
          await emitToUser(io, senderId, "message_status_update", {
            messageId: data.messageId,
            status: "acknowledged",
            recipientId: authUser.userId,
            timestamp: new Date().toISOString()
          });
        }

        log(`✅ Confirmed decryption & acknowledged message ${data.messageId} for ${authUser.username}`);
      } catch (err) {
        log("Error processing ack_direct_message:", err);
        emitSocketError(socket, new DatabaseError("Failed to process mailbox acknowledgment", { cause: err }), "DATABASE_ERROR");
      }
    });

    // -------------------------------------------------------------------------
    // Signal Decryption Error Handler (Phase 11.2)
    // -------------------------------------------------------------------------
    socket.on("signal_decryption_error", async (data: {
      messageId: string;
      senderId?: string;
      senderUsername?: string;
      reason?: string;
    }) => {
      try {
        if (!authUser?.userId) {
          return emitSocketError(socket, new AuthenticationError("Unauthorized socket session"), "AUTHENTICATION_ERROR");
        }
        const { messageId, senderId, senderUsername, reason } = data || {};
        if (!messageId) {
          return emitSocketError(socket, new ValidationError("messageId is required for decryption error reporting"), "VALIDATION_ERROR");
        }

        const cryptoErr = new CryptoError(
          `Signal Protocol decryption failed for message ${messageId} from ${senderUsername || senderId || "unknown"}: ${reason || "MAC verification or session desync"}`,
          { details: { messageId, senderId, senderUsername, reason } }
        );

        // Update message_deliveries table to track failure state
        await MessageService.recordDecryptionFailure(authUser.userId, messageId, senderId);

        emitSocketError(socket, cryptoErr, "CRYPTO_ERROR", "signal_decryption_error");
      } catch (err: any) {
        emitSocketError(socket, new CryptoError("Failed handling Signal decryption error report", { cause: err }), "CRYPTO_ERROR");
      }
    });

    // -------------------------------------------------------------------------
    // Direct Message Read Receipt Handler
    // -------------------------------------------------------------------------
    socket.on("read_direct_message", async (rawData: any) => {
      try {
        if (!authUser?.userId) return;

        const val = validateSocket(socketReadDirectMessageSchema, rawData, socket);
        if (!val.success || !val.data) return;
        const data = val.data;

        const resolvedSenderId = await MessageService.markDirectMessageRead(
          authUser.userId,
          data.messageId,
          data.senderId
        );

        if (resolvedSenderId) {
          await emitToUser(io, resolvedSenderId, "message_status_update", {
            messageId: data.messageId,
            status: "read",
            recipientId: authUser.userId,
            timestamp: new Date().toISOString()
          });
        }
        log(`👁️ Message ${data.messageId} marked as read by ${authUser.username}`);
      } catch (err) {
        log("Error processing read_direct_message:", err);
        emitSocketError(socket, new DatabaseError("Failed to process message read receipt", { cause: err }), "DATABASE_ERROR");
      }
    });

    // -------------------------------------------------------------------------
    // Query Message Statuses
    // -------------------------------------------------------------------------
    socket.on("get_message_statuses", async (data: { messageIds: string[] }, callback?: (statuses: Record<string, string>) => void) => {
      try {
        const result = await MessageService.getMessageStatuses(data?.messageIds);

        if (typeof callback === "function") {
          callback(result);
        } else {
          socket.emit("message_statuses_response", result);
        }
      } catch (err) {
        log("Error querying message statuses:", err);
      }
    });

    // -------------------------------------------------------------------------
    // Room Switch Handler
    // -------------------------------------------------------------------------
    socket.on("switch_room", async (newRoom: string) => {
      try {
        if (!authUser?.userId) {
          return emitSocketError(socket, new AuthenticationError("User session not found for socket"), "AUTHENTICATION_ERROR");
        }

        if (!newRoom) {
          return emitSocketError(socket, new ValidationError("newRoom parameter is required"), "VALIDATION_ERROR");
        }

        if (newRoom !== "general") {
          const roomRow = await RoomService.getRoom(newRoom);
          if (!roomRow) {
            return emitSocketError(socket, new NotFoundError(`Room '${newRoom}' does not exist`), "NOT_FOUND");
          }
        }

        const socketMeta = await PresenceService.getSocketMetadata(socket.id);
        const currentRoom = socketMeta?.room || "general";
        socket.leave(currentRoom);
        socket.join(newRoom);

        await PresenceService.markOnline(authUser.userId, socket.id, {
          room: newRoom,
          username: authUser.username,
        });

        const onlineUsers = await PresenceService.getOnlineUsers();
        socket.emit("existing_users", onlineUsers);

        socket.to(newRoom).emit("user_joined", {
          userId: authUser.userId,
          username: authUser.username,
          socketId: socket.id,
          room: newRoom,
        });

        log(`🔀 ${authUser.username} switched to room ${newRoom}`);
      } catch (err) {
        log("Error handling switch_room:", err);
        emitSocketError(socket, new AppError("Room switch failed", 500, "ROOM_SWITCH_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Presence Status Update (Online, Away, DND, Offline)
    // -------------------------------------------------------------------------
    socket.on("update_status", async (rawData: any) => {
      try {
        if (!authUser?.userId) {
          return emitSocketError(socket, new AuthenticationError("User session not found for socket"), "AUTHENTICATION_ERROR");
        }

        const normalizedData = typeof rawData === "string" ? { status: rawData } : rawData;
        const val = validateSocket(socketUpdateStatusSchema, normalizedData, socket);
        if (!val.success || !val.data) return;
        const data = val.data;

        await PresenceService.updateStatus(authUser.userId, data.status, data.customStatus);
        const onlineUsers = await PresenceService.getOnlineUsers();
        io.emit("presence_update", onlineUsers);
        io.emit("user_presence", {
          userId: authUser.userId,
          username: authUser.username,
          status: data.status,
          customStatus: data.customStatus,
          online: true,
        });
        log(`🔔 ${authUser.username} set status to ${data.status}`);
      } catch (err) {
        log("Error handling update_status:", err);
        emitSocketError(socket, new AppError("Status update failed", 500, "STATUS_UPDATE_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Send Broadcast Room Message
    // -------------------------------------------------------------------------
    socket.on("send_message", async (data: SendMessageData) => {
      try {
        const now = Date.now();
        const timestamps = messageTimestamps.get(socket.id) ?? [];
        const recent = timestamps.filter((t) => now - t < MESSAGE_WINDOW_MS);
        recent.push(now);
        messageTimestamps.set(socket.id, recent);
        if (recent.length > MESSAGE_LIMIT) {
          return emitSocketError(socket, new RateLimitError("Message rate limit exceeded (max 5 per 2s)"), "RATE_LIMIT_EXCEEDED");
        }

        if (!isPayloadRecord(data?.payloads)) {
          return emitSocketError(socket, new ValidationError("Invalid message payload"), "VALIDATION_ERROR");
        }

        const roomId = data.roomId || "general";
        const senderUsername = authUser?.username || data.author || "anon";
        const senderId = authUser?.userId || data.senderId || "anon";

        const messageBroadcast = {
          ...data,
          author: senderUsername,
          senderId,
          payloads: data.payloads,
        };

        try {
          await MessageService.sendRoomMessage({
            roomId,
            senderId,
            senderUsername,
            payloads: data.payloads,
            mediaUrl: data.mediaUrl || null,
            fileName: data.fileName || null,
            fileSize: data.fileSize || null,
          });
        } catch (dbErr) {
          log("Message insertion error:", dbErr);
        }

        io.to(roomId).emit("receive_message", messageBroadcast);
        log(`💬 Room message sent to room ${roomId} by ${senderUsername}`);
      } catch (err) {
        log("Error handling send_message:", err);
        emitSocketError(socket, new AppError("Message send failed", 500, "MESSAGE_SEND_ERROR", true, { cause: err }));
      }
    });

    // -------------------------------------------------------------------------
    // Message Deletion
    // -------------------------------------------------------------------------
    socket.on("delete_message", async (data: DeleteMessageData) => {
      try {
        await MessageService.deleteMessage(data.messageId);
        io.to(data.roomId).emit("message_deleted", { messageId: data.messageId });
        log(`🗑️ Message ${data.messageId} deleted in room ${data.roomId}`);
      } catch (err) {
        log("Failed deleting message:", err);
        emitSocketError(socket, new DatabaseError("Message deletion failed", { cause: err }), "DATABASE_ERROR");
      }
    });

    // -------------------------------------------------------------------------
    // Typing Indicators
    // -------------------------------------------------------------------------
    socket.on("typing_start", (data: TypingData) => {
      socket.to(data.roomId).emit("user_typing", {
        username: authUser?.username || data.username,
        roomId: data.roomId,
        isTyping: true,
      });
    });

    socket.on("typing_stop", (data: TypingData) => {
      socket.to(data.roomId).emit("user_typing", {
        username: authUser?.username || data.username,
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
    // Disconnect handling (Redis Presence Service)
    // -------------------------------------------------------------------------
    socket.on("disconnect", async () => {
      try {
        const { userId, username, isLastSocket, remainingSockets } = await PresenceService.markOffline(socket.id);
        if (userId) {
          if (isLastSocket) {
            io.emit("user_left", {
              username: username || "User",
              socketId: socket.id,
              userId,
            });
            io.emit("user_presence", {
              userId,
              username: username || "User",
              online: false,
            });
          }
          const onlineUsers = await PresenceService.getOnlineUsers();
          io.emit("presence_update", onlineUsers);
          log(`❌ Socket ${socket.id} (${username || userId}) disconnected. (Remaining sockets: ${remainingSockets.length})`);
        } else {
          log(`❌ Socket ${socket.id} disconnected (no user record)`);
        }
      } catch (err) {
        log("Error during socket disconnect cleanup:", err);
      } finally {
        messageTimestamps.delete(socket.id);
      }
    });

    // -------------------------------------------------------------------------
    // Generic socket error handler
    // -------------------------------------------------------------------------
    socket.on("error", (err) => {
      log("Socket error:", err);
    });
  });
}
