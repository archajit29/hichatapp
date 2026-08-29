import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { RedisClientType } from "redis";
import { config } from "../core/config";
import { logger } from "../core/logger";
import { createRedisClientInstance, getMaskedRedisUrl, isUsingMemoryRedis } from "../db/redis";

const adapterLogger = logger.child({ module: "redis-adapter" });

let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let isAdapterAttached = false;

/**
 * Initializes and attaches the Redis Pub/Sub adapter to Socket.IO for horizontal scaling (Phase 13E).
 * Enables multi-container ECS task orchestration without duplicate event broadcasting.
 */
export async function setupRedisAdapter(io: Server): Promise<boolean> {
  const redisUrl = config.database?.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
  const maskedUrl = getMaskedRedisUrl(redisUrl);

  if (isUsingMemoryRedis()) {
    adapterLogger.info(
      { event: "REDIS_ADAPTER_FALLBACK", url: maskedUrl },
      "ℹ️ Using default in-memory Socket.IO adapter (offline/dev fallback)"
    );
    return false;
  }

  try {
    if (!pubClient || !pubClient.isOpen) {
      pubClient = createRedisClientInstance();
      await pubClient.connect();
    }

    if (!subClient || !subClient.isOpen) {
      subClient = pubClient.duplicate();
      await subClient.connect();
    }

    io.adapter(createAdapter(pubClient, subClient));
    isAdapterAttached = true;

    adapterLogger.info(
      { event: "REDIS_ADAPTER_CONNECTED", url: maskedUrl },
      "🔗 Socket.IO Redis Pub/Sub adapter attached successfully for horizontal scaling"
    );
    return true;
  } catch (err: any) {
    isAdapterAttached = false;
    const safeError = err?.message || String(err);

    if (config.isProduction) {
      adapterLogger.error(
        { event: "REDIS_ADAPTER_ERROR", err: safeError, url: maskedUrl },
        "❌ Fatal: Failed to attach Socket.IO Redis adapter in production"
      );
      throw new Error(`Failed to configure Redis Socket.IO adapter: ${safeError}`);
    }

    adapterLogger.warn(
      { event: "REDIS_ADAPTER_FALLBACK", err: safeError, url: maskedUrl },
      "⚠️ Redis adapter connection failed: Falling back to default in-memory Socket.IO adapter"
    );
    return false;
  }
}

/**
 * Gracefully disconnects the Redis Pub/Sub adapter clients on shutdown.
 */
export async function closeRedisAdapter(): Promise<void> {
  try {
    if (subClient && subClient.isOpen) {
      await subClient.quit();
    }
    if (pubClient && pubClient.isOpen) {
      await pubClient.quit();
    }
    pubClient = null;
    subClient = null;
    isAdapterAttached = false;

    adapterLogger.info(
      { event: "REDIS_ADAPTER_DISCONNECTED" },
      "🛑 Socket.IO Redis Pub/Sub adapter disconnected gracefully"
    );
  } catch (err: any) {
    adapterLogger.error(
      { err: err?.message || String(err) },
      "Error disconnecting Socket.IO Redis adapter"
    );
  }
}

/**
 * Returns active Redis adapter status and underlying clients.
 */
export function getRedisAdapterState() {
  return {
    attached: isAdapterAttached,
    pubClient,
    subClient,
  };
}
