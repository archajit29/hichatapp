import { redis } from "../db/redis";
import { logger } from "../core/logger";

const presenceLogger = logger.child({ module: "presence" });

export const PRESENCE_TTL_SECONDS = 60;
export const HEARTBEAT_INTERVAL_MS = 30000;

export interface UserPresence {
  userId: string;
  username: string;
  status: string;
  customStatus?: string;
  online: boolean;
  socketCount: number;
  sockets: string[];
  lastHeartbeat?: string;
  connectedAt?: string;
}

export class PresenceService {
  /**
   * Registers a user socket connection in Redis and marks the user online (Phase 13E).
   * Supports multi-device logins (e.g. desktop, mobile, tablet) under a single user identity.
   */
  static async markOnline(
    userId: string,
    socketId: string,
    metadata?: {
      username?: string;
      status?: string;
      customStatus?: string;
      room?: string;
      publicKey?: string;
    }
  ): Promise<{ isFirstSocket: boolean; socketCount: number }> {
    const nowIso = new Date().toISOString();
    const username = metadata?.username || "unknown";
    const status = metadata?.status || "online";
    const customStatus = metadata?.customStatus || "";
    const room = metadata?.room || "general";
    const publicKey = metadata?.publicKey || "";

    const userSocketsKey = `presence:user_sockets:${userId}`;
    const userMetaKey = `presence:user:${userId}`;
    const socketMetaKey = `presence:socket:${socketId}`;
    const onlineUsersKey = "presence:online_users";

    // 1. Add socket to user's active socket set in Redis
    await redis.sAdd(userSocketsKey, socketId);
    await redis.expire(userSocketsKey, PRESENCE_TTL_SECONDS);

    // 2. Add user to global online_users set in Redis
    await redis.sAdd(onlineUsersKey, userId);

    // 3. Store user metadata hash in Redis
    await redis.hSet(userMetaKey, {
      userId,
      username,
      status,
      customStatus,
      publicKey,
      lastHeartbeat: nowIso,
      connectedAt: nowIso,
    });
    await redis.expire(userMetaKey, PRESENCE_TTL_SECONDS);

    // 4. Store socket mapping hash in Redis
    await redis.hSet(socketMetaKey, {
      userId,
      username,
      socketId,
      room,
      publicKey,
      connectedAt: nowIso,
    });
    await redis.expire(socketMetaKey, PRESENCE_TTL_SECONDS);

    // 5. Query active socket count to detect multi-device connection state
    const socketCount = await redis.sCard(userSocketsKey);
    const isFirstSocket = socketCount === 1;

    presenceLogger.info(
      {
        event: "PRESENCE_ONLINE",
        userId,
        username,
        socketId,
        socketCount,
        isFirstSocket,
        room,
      },
      `🟢 [PRESENCE_ONLINE] User ${username} (${userId}) connected on socket ${socketId} (Total devices: ${socketCount})`
    );

    return { isFirstSocket, socketCount };
  }

  /**
   * Unregisters a disconnecting socket.
   * Keeps user presence online until ALL sockets for that user have disconnected.
   */
  static async markOffline(
    socketId: string
  ): Promise<{
    userId: string | null;
    username: string | null;
    isLastSocket: boolean;
    remainingSockets: string[];
  }> {
    const socketMetaKey = `presence:socket:${socketId}`;
    const socketMeta = await redis.hGetAll(socketMetaKey);

    const userId = socketMeta?.userId || null;
    const username = socketMeta?.username || null;

    // Remove socket mapping
    await redis.del(socketMetaKey);

    if (!userId) {
      return {
        userId: null,
        username: null,
        isLastSocket: true,
        remainingSockets: [],
      };
    }

    const userSocketsKey = `presence:user_sockets:${userId}`;
    const userMetaKey = `presence:user:${userId}`;
    const onlineUsersKey = "presence:online_users";

    // Remove this socket from user's socket set
    await redis.sRem(userSocketsKey, socketId);
    const remainingSockets = await redis.sMembers(userSocketsKey);
    const isLastSocket = remainingSockets.length === 0;

    if (isLastSocket) {
      // All devices disconnected: remove user from global online set and delete metadata
      await redis.sRem(onlineUsersKey, userId);
      await redis.del(userMetaKey);
      await redis.del(userSocketsKey);

      presenceLogger.info(
        {
          event: "PRESENCE_OFFLINE",
          userId,
          username,
          socketId,
          isLastSocket: true,
        },
        `🔴 [PRESENCE_OFFLINE] User ${username || userId} went offline (all sockets disconnected)`
      );
    } else {
      // User still active on other devices: refresh TTL on remaining set and metadata
      await redis.expire(userSocketsKey, PRESENCE_TTL_SECONDS);
      await redis.expire(userMetaKey, PRESENCE_TTL_SECONDS);

      presenceLogger.info(
        {
          event: "PRESENCE_OFFLINE",
          userId,
          username,
          socketId,
          isLastSocket: false,
          remainingSocketsCount: remainingSockets.length,
        },
        `🟡 [PRESENCE_DEVICE_DISCONNECTED] Socket ${socketId} disconnected for user ${username} (Remaining devices: ${remainingSockets.length})`
      );
    }

    return {
      userId,
      username,
      isLastSocket,
      remainingSockets,
    };
  }

  /**
   * Refreshes Redis TTL for a user and optional socket ID on periodic heartbeat (every 30s).
   */
  static async heartbeat(userId: string, socketId?: string): Promise<boolean> {
    const userSocketsKey = `presence:user_sockets:${userId}`;
    const userMetaKey = `presence:user:${userId}`;

    const exists = await redis.exists(userMetaKey);
    if (!exists) return false;

    const nowIso = new Date().toISOString();
    await redis.hSet(userMetaKey, "lastHeartbeat", nowIso);
    await redis.expire(userMetaKey, PRESENCE_TTL_SECONDS);
    await redis.expire(userSocketsKey, PRESENCE_TTL_SECONDS);

    if (socketId) {
      const socketMetaKey = `presence:socket:${socketId}`;
      await redis.expire(socketMetaKey, PRESENCE_TTL_SECONDS);
    }

    presenceLogger.debug(
      { event: "PRESENCE_HEARTBEAT", userId, socketId },
      `💓 [PRESENCE_HEARTBEAT] Refreshed presence TTL for user ${userId}`
    );

    return true;
  }

  /**
   * Retrieves presence profile for a specific user ID from Redis.
   */
  static async getPresence(userId: string): Promise<UserPresence | null> {
    const userMetaKey = `presence:user:${userId}`;
    const userSocketsKey = `presence:user_sockets:${userId}`;

    const [userMeta, sockets] = await Promise.all([
      redis.hGetAll(userMetaKey),
      redis.sMembers(userSocketsKey),
    ]);

    if (!userMeta || Object.keys(userMeta).length === 0 || sockets.length === 0) {
      return null;
    }

    return {
      userId,
      username: userMeta.username || "unknown",
      status: userMeta.status || "online",
      customStatus: userMeta.customStatus || "",
      online: sockets.length > 0,
      socketCount: sockets.length,
      sockets,
      lastHeartbeat: userMeta.lastHeartbeat,
      connectedAt: userMeta.connectedAt,
    };
  }

  /**
   * Returns list of all online users across the cluster from Redis.
   */
  static async getOnlineUsers(): Promise<UserPresence[]> {
    const onlineUsersKey = "presence:online_users";
    const userIds = await redis.sMembers(onlineUsersKey);

    if (!userIds || userIds.length === 0) {
      return [];
    }

    const results: UserPresence[] = [];
    for (const userId of userIds) {
      const presence = await this.getPresence(userId);
      if (presence && presence.online) {
        results.push(presence);
      }
    }

    return results;
  }

  /**
   * Returns active socket IDs for a given user.
   */
  static async getUserSockets(userId: string): Promise<string[]> {
    const userSocketsKey = `presence:user_sockets:${userId}`;
    return await redis.sMembers(userSocketsKey);
  }

  /**
   * Returns socket metadata by socket ID from Redis.
   */
  static async getSocketMetadata(socketId: string): Promise<Record<string, string> | null> {
    const socketMetaKey = `presence:socket:${socketId}`;
    const data = await redis.hGetAll(socketMetaKey);
    return data && Object.keys(data).length > 0 ? data : null;
  }

  /**
   * Updates user presence status (e.g. online, away, dnd).
   */
  static async updateStatus(userId: string, status: string, customStatus?: string): Promise<boolean> {
    const userMetaKey = `presence:user:${userId}`;
    const exists = await redis.exists(userMetaKey);
    if (!exists) return false;

    await redis.hSet(userMetaKey, "status", status);
    if (customStatus !== undefined) {
      await redis.hSet(userMetaKey, "customStatus", customStatus);
    }
    await redis.expire(userMetaKey, PRESENCE_TTL_SECONDS);
    return true;
  }

  /**
   * Periodic garbage collector removing expired user presences and dangling socket mappings.
   */
  static async cleanupExpiredPresence(): Promise<{
    expiredUsers: string[];
    cleanedSockets: string[];
  }> {
    const onlineUsersKey = "presence:online_users";
    const userIds = await redis.sMembers(onlineUsersKey);
    const expiredUsers: string[] = [];
    const cleanedSockets: string[] = [];

    for (const userId of userIds) {
      const userSocketsKey = `presence:user_sockets:${userId}`;
      const userMetaKey = `presence:user:${userId}`;
      const sockets = await redis.sMembers(userSocketsKey);

      let activeSocketsForUser: string[] = [];
      for (const sId of sockets) {
        const sockKey = `presence:socket:${sId}`;
        const sockExists = await redis.exists(sockKey);
        if (!sockExists) {
          await redis.sRem(userSocketsKey, sId);
          cleanedSockets.push(sId);
        } else {
          activeSocketsForUser.push(sId);
        }
      }

      const userExists = await redis.exists(userMetaKey);
      if (!userExists || activeSocketsForUser.length === 0) {
        await redis.sRem(onlineUsersKey, userId);
        await redis.del(userMetaKey);
        await redis.del(userSocketsKey);
        expiredUsers.push(userId);
      }
    }

    if (expiredUsers.length > 0 || cleanedSockets.length > 0) {
      presenceLogger.info(
        {
          event: "PRESENCE_CLEANUP",
          expiredUsersCount: expiredUsers.length,
          cleanedSocketsCount: cleanedSockets.length,
          expiredUsers,
        },
        `🧹 [PRESENCE_CLEANUP] Cleaned ${expiredUsers.length} expired users and ${cleanedSockets.length} orphan sockets`
      );
    }

    return { expiredUsers, cleanedSockets };
  }

  /**
   * Diagnostic presence metrics for the `/health` endpoint.
   */
  static async getPresenceStats(): Promise<{
    onlineUsers: number;
    trackedSockets: number;
  }> {
    try {
      const onlineUsersKey = "presence:online_users";
      const onlineUsers = await redis.sCard(onlineUsersKey);

      const socketKeys = await redis.keys("presence:socket:*");
      const trackedSockets = Array.isArray(socketKeys) ? socketKeys.length : 0;

      return {
        onlineUsers: Number(onlineUsers) || 0,
        trackedSockets: Number(trackedSockets) || 0,
      };
    } catch {
      return {
        onlineUsers: 0,
        trackedSockets: 0,
      };
    }
  }
}
