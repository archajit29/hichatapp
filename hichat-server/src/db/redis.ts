import { createClient, RedisClientType } from "redis";
import { config } from "../core/config";
import { logger } from "../core/logger";

const redisLogger = logger.child({ module: "redis" });

/**
 * Sanitizes Redis URL by redacting credentials for secure logging (Phase 13D/13E).
 */
export function getMaskedRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "******";
    }
    if (parsed.username && parsed.username !== "default") {
      parsed.username = "******";
    }
    return parsed.toString();
  } catch {
    return "redis://[redacted]";
  }
}

type MessageListener = (message: string, channel: string) => void;

/**
 * In-memory fallback Redis engine for offline development, local tests, and failover resilience.
 * Implements Strings, Sets, Hashes, Key TTL, and Pub/Sub.
 */
export class MemoryRedisStore {
  private stringStore: Map<string, { value: string; expiresAt?: number }> = new Map();
  private setStore: Map<string, { set: Set<string>; expiresAt?: number }> = new Map();
  private hashStore: Map<string, { hash: Map<string, string>; expiresAt?: number }> = new Map();
  private static subscribers: Map<string, Set<MessageListener>> = new Map();

  private isExpired(expiresAt?: number): boolean {
    return typeof expiresAt === "number" && Date.now() > expiresAt;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  // --- String Operations ---
  async set(key: string, value: string | number, options?: { EX?: number; PX?: number }): Promise<string | null> {
    let expiresAt: number | undefined;
    if (options?.EX) {
      expiresAt = Date.now() + options.EX * 1000;
    } else if (options?.PX) {
      expiresAt = Date.now() + options.PX;
    }
    this.stringStore.set(String(key), { value: String(value), expiresAt });
    return "OK";
  }

  async setEx(key: string, seconds: number, value: string | number): Promise<string | null> {
    const expiresAt = Date.now() + seconds * 1000;
    this.stringStore.set(String(key), { value: String(value), expiresAt });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    const item = this.stringStore.get(String(key));
    if (!item) return null;
    if (this.isExpired(item.expiresAt)) {
      this.stringStore.delete(String(key));
      return null;
    }
    return item.value;
  }

  async del(keys: string | string[]): Promise<number> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    let deletedCount = 0;
    for (const k of keyArray) {
      const sK = String(k);
      if (this.stringStore.delete(sK)) deletedCount++;
      if (this.setStore.delete(sK)) deletedCount++;
      if (this.hashStore.delete(sK)) deletedCount++;
    }
    return deletedCount;
  }

  async exists(keys: string | string[]): Promise<number> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const k of keyArray) {
      const sK = String(k);
      const str = this.stringStore.get(sK);
      if (str && !this.isExpired(str.expiresAt)) { count++; continue; }
      const set = this.setStore.get(sK);
      if (set && !this.isExpired(set.expiresAt)) { count++; continue; }
      const hash = this.hashStore.get(sK);
      if (hash && !this.isExpired(hash.expiresAt)) { count++; continue; }
    }
    return count;
  }

  // --- Key Expiry Operations ---
  async expire(key: string, seconds: number): Promise<boolean> {
    const sK = String(key);
    const expiresAt = Date.now() + seconds * 1000;
    let found = false;

    const str = this.stringStore.get(sK);
    if (str) { str.expiresAt = expiresAt; found = true; }
    const set = this.setStore.get(sK);
    if (set) { set.expiresAt = expiresAt; found = true; }
    const hash = this.hashStore.get(sK);
    if (hash) { hash.expiresAt = expiresAt; found = true; }

    return found;
  }

  async ttl(key: string): Promise<number> {
    const sK = String(key);
    let expiresAt: number | undefined;
    const str = this.stringStore.get(sK);
    if (str) expiresAt = str.expiresAt;
    const set = this.setStore.get(sK);
    if (set) expiresAt = set.expiresAt;
    const hash = this.hashStore.get(sK);
    if (hash) expiresAt = hash.expiresAt;

    if (expiresAt === undefined) return -1;
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  // --- Set Operations ---
  async sAdd(key: string, members: string | string[]): Promise<number> {
    const sK = String(key);
    let entry = this.setStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      entry = { set: new Set<string>() };
      this.setStore.set(sK, entry);
    }
    const memberArray = Array.isArray(members) ? members : [members];
    let added = 0;
    for (const m of memberArray) {
      const sM = String(m);
      if (!entry.set.has(sM)) {
        entry.set.add(sM);
        added++;
      }
    }
    return added;
  }

  async sRem(key: string, members: string | string[]): Promise<number> {
    const sK = String(key);
    const entry = this.setStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) return 0;
    const memberArray = Array.isArray(members) ? members : [members];
    let removed = 0;
    for (const m of memberArray) {
      if (entry.set.delete(String(m))) removed++;
    }
    if (entry.set.size === 0) {
      this.setStore.delete(sK);
    }
    return removed;
  }

  async sMembers(key: string): Promise<string[]> {
    const sK = String(key);
    const entry = this.setStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      this.setStore.delete(sK);
      return [];
    }
    return Array.from(entry.set);
  }

  async sCard(key: string): Promise<number> {
    const sK = String(key);
    const entry = this.setStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      this.setStore.delete(sK);
      return 0;
    }
    return entry.set.size;
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    const sK = String(key);
    const entry = this.setStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      this.setStore.delete(sK);
      return false;
    }
    return entry.set.has(String(member));
  }

  // --- Hash Operations ---
  async hSet(key: string, fieldOrObj: string | Record<string, any>, value?: any): Promise<number> {
    const sK = String(key);
    let entry = this.hashStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      entry = { hash: new Map<string, string>() };
      this.hashStore.set(sK, entry);
    }
    let added = 0;
    if (typeof fieldOrObj === "object" && fieldOrObj !== null) {
      for (const [f, v] of Object.entries(fieldOrObj)) {
        if (!entry.hash.has(f)) added++;
        entry.hash.set(f, String(v));
      }
    } else if (typeof fieldOrObj === "string" && value !== undefined) {
      if (!entry.hash.has(fieldOrObj)) added++;
      entry.hash.set(fieldOrObj, String(value));
    }
    return added;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const sK = String(key);
    const entry = this.hashStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) return null;
    return entry.hash.get(String(field)) || null;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const sK = String(key);
    const entry = this.hashStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) {
      this.hashStore.delete(sK);
      return {};
    }
    const result: Record<string, string> = {};
    for (const [f, v] of entry.hash.entries()) {
      result[f] = v;
    }
    return result;
  }

  async hDel(key: string, fields: string | string[]): Promise<number> {
    const sK = String(key);
    const entry = this.hashStore.get(sK);
    if (!entry || this.isExpired(entry.expiresAt)) return 0;
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    let removed = 0;
    for (const f of fieldArray) {
      if (entry.hash.delete(String(f))) removed++;
    }
    return removed;
  }

  // --- Pattern Scan / Keys ---
  async keys(pattern: string = "*"): Promise<string[]> {
    const now = Date.now();
    const result = new Set<string>();

    for (const [k, item] of this.stringStore.entries()) {
      if (item.expiresAt && now > item.expiresAt) { this.stringStore.delete(k); continue; }
      if (this.matchesPattern(k, pattern)) result.add(k);
    }
    for (const [k, item] of this.setStore.entries()) {
      if (item.expiresAt && now > item.expiresAt) { this.setStore.delete(k); continue; }
      if (this.matchesPattern(k, pattern)) result.add(k);
    }
    for (const [k, item] of this.hashStore.entries()) {
      if (item.expiresAt && now > item.expiresAt) { this.hashStore.delete(k); continue; }
      if (this.matchesPattern(k, pattern)) result.add(k);
    }

    return Array.from(result);
  }

  private matchesPattern(key: string, pattern: string): boolean {
    if (pattern === "*") return true;
    const regexStr = "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
    return new RegExp(regexStr).test(key);
  }

  // --- Pub/Sub ---
  async publish(channel: string, message: string): Promise<number> {
    const listeners = MemoryRedisStore.subscribers.get(channel);
    if (!listeners || listeners.size === 0) return 0;
    for (const listener of listeners) {
      try {
        listener(message, channel);
      } catch (err) {
        redisLogger.error({ err, channel }, "Error in pubsub message listener");
      }
    }
    return listeners.size;
  }

  async subscribe(channel: string, listener: MessageListener): Promise<void> {
    if (!MemoryRedisStore.subscribers.has(channel)) {
      MemoryRedisStore.subscribers.set(channel, new Set());
    }
    MemoryRedisStore.subscribers.get(channel)!.add(listener);
  }

  async pSubscribe(pattern: string, listener: MessageListener): Promise<void> {
    await this.subscribe(pattern, listener);
  }

  async unsubscribe(channel: string, listener?: MessageListener): Promise<void> {
    if (!listener) {
      MemoryRedisStore.subscribers.delete(channel);
    } else {
      MemoryRedisStore.subscribers.get(channel)?.delete(listener);
    }
  }

  async flushAll(): Promise<string> {
    this.stringStore.clear();
    this.setStore.clear();
    this.hashStore.clear();
    return "OK";
  }

  duplicate(): MemoryRedisStore {
    return this;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async quit(): Promise<void> {}
}

export const memoryRedisStore = new MemoryRedisStore();

let rawRedisClient: RedisClientType | null = null;
let isConnected = false;
let isInMemoryFallback = false;

/**
 * Creates and configures a Node-Redis client instance with automatic
 * exponential backoff reconnection (max 5 retries).
 */
export function createRedisClientInstance(): RedisClientType {
  const redisUrl = config.database?.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
  const maskedUrl = getMaskedRedisUrl(redisUrl);

  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy(retries: number) {
        if (retries > 5) {
          redisLogger.error(
            { retries, url: maskedUrl },
            "❌ Redis maximum reconnect attempts (5) exhausted"
          );
          return new Error("Redis reconnection max retries (5) exhausted");
        }
        const delay = Math.min(Math.pow(2, retries) * 100, 3000);
        redisLogger.warn(
          { retries, delayMs: delay, url: maskedUrl },
          `🔄 Reconnecting to Redis (attempt ${retries}/5)...`
        );
        return delay;
      },
    },
  }) as RedisClientType;

  client.on("error", (err: any) => {
    // Log failure without exposing secrets
    redisLogger.error(
      { err: err?.message || String(err), url: maskedUrl },
      "❌ Redis client error event"
    );
  });

  client.on("reconnecting", () => {
    redisLogger.info({ url: maskedUrl }, "🔄 Redis client reconnecting...");
  });

  client.on("ready", () => {
    isConnected = true;
    isInMemoryFallback = false;
    redisLogger.info({ url: maskedUrl }, "🔴 Connected to Upstash Redis successfully!");
  });

  return client;
}

/**
 * Connects the singleton Redis client.
 * Connects to live Upstash/RDS Redis or gracefully falls back to in-memory store for offline resilience.
 */
export async function connectRedis(): Promise<any> {
  const redisUrl = config.database?.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
  const maskedUrl = getMaskedRedisUrl(redisUrl);

  try {
    if (!rawRedisClient || !rawRedisClient.isOpen) {
      rawRedisClient = createRedisClientInstance();
      await rawRedisClient.connect();
    }

    // Verify connection with PING
    await rawRedisClient.ping();
    isConnected = true;
    isInMemoryFallback = false;
    redisLogger.info({ url: maskedUrl }, "🔴 Connected to Upstash Redis successfully!");
    return rawRedisClient;
  } catch (err: any) {
    isConnected = false;
    const safeError = err?.message || String(err);

    if (config.isProduction) {
      redisLogger.error(
        { err: safeError, url: maskedUrl },
        "❌ Fatal: Failed to connect to Redis in production"
      );
      throw new Error(`Failed to connect to Redis at ${maskedUrl}: ${safeError}`);
    }

    // Development & Test Offline Fallback
    isInMemoryFallback = true;
    isConnected = true;
    redisLogger.warn(
      { err: safeError, url: maskedUrl },
      "⚠️ Redis server unreachable: Running with in-memory Redis engine fallback"
    );
    return memoryRedisStore;
  }
}

/**
 * Gracefully disconnects the Redis client instance.
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (rawRedisClient && rawRedisClient.isOpen) {
      await rawRedisClient.quit();
    }
    rawRedisClient = null;
    isConnected = false;
    isInMemoryFallback = false;
    redisLogger.info("🛑 Redis client disconnected gracefully.");
  } catch (err: any) {
    redisLogger.error({ err: err?.message || String(err) }, "Error closing Redis client");
  }
}

/**
 * Returns connection state of Redis.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

export function isUsingMemoryRedis(): boolean {
  return isInMemoryFallback;
}

export function getRawRedisClient(): RedisClientType | null {
  return rawRedisClient;
}

/**
 * Health check diagnostics for Redis.
 */
export async function healthCheckRedis(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    if (!isConnected) {
      return {
        healthy: false,
        error: "Redis client is not connected",
      };
    }

    const client = isInMemoryFallback ? memoryRedisStore : (rawRedisClient || memoryRedisStore);
    await client.ping();
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      healthy: true,
      latencyMs,
    };
  } catch (err: any) {
    return {
      healthy: false,
      error: err?.message || "Redis health check failed",
    };
  }
}

/**
 * Proxy singleton export for `redis`.
 * Transparently delegates commands to the live `rawRedisClient` or `memoryRedisStore`.
 */
export const redis: any = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (isInMemoryFallback || !rawRedisClient || !rawRedisClient.isOpen) {
        if (prop in memoryRedisStore) {
          const fn = (memoryRedisStore as any)[prop];
          return typeof fn === "function" ? fn.bind(memoryRedisStore) : fn;
        }
      }

      if (rawRedisClient && prop in rawRedisClient) {
        const fn = (rawRedisClient as any)[prop];
        return typeof fn === "function" ? fn.bind(rawRedisClient) : fn;
      }

      // Default to memory store method if available
      if (prop in memoryRedisStore) {
        const fn = (memoryRedisStore as any)[prop];
        return typeof fn === "function" ? fn.bind(memoryRedisStore) : fn;
      }

      return undefined;
    },
  }
);
