import { pool, query, transaction, connect, disconnect, healthCheck, extractQueryName, isPostgresConnected } from "./postgres";
import { connectRedis, disconnectRedis, redis, healthCheckRedis, isRedisConnected } from "./redis";
import { logger } from "../core/logger";
import { runPendingMigrations } from "./migrator";
import { runSeeds } from "./seeds/index";

const dbLogger = logger.child({ module: "db" });

export const REQUIRED_TABLES = [
  "schema_migrations",
  "users",
  "rooms",
  "direct_messages",
  "messages",
  "user_devices",
  "signed_prekeys",
  "one_time_prekeys",
  "mailbox",
  "message_deliveries",
  "refresh_tokens",
] as const;

let dbReady = false;

export function isDatabaseReady(): boolean {
  return dbReady;
}

export async function verifyRequiredTables(): Promise<string[]> {
  dbLogger.info("🔍 Verifying required database schema tables...");
  const missingTables: string[] = [];

  for (const tableName of REQUIRED_TABLES) {
    try {
      await query(`SELECT 1 FROM ${tableName} LIMIT 0;`);
    } catch (err: any) {
      dbLogger.error({ tableName, err: err.message }, `❌ Missing required table: ${tableName}`);
      missingTables.push(tableName);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(`Database verification failed: missing required tables [${missingTables.join(", ")}]`);
  }

  dbLogger.info({ tableCount: REQUIRED_TABLES.length }, "✅ All required database tables verified successfully");
  return [...REQUIRED_TABLES];
}

function normalizePlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

class PostgresDatabase {
  public pool = pool;

  exec(sql: string): Promise<any> {
    return query(sql);
  }

  query<T = any>(sql: string, params?: any[]): Promise<any> {
    return query<T>(normalizePlaceholders(sql), params);
  }

  prepare(sql: string) {
    const pgSql = normalizePlaceholders(sql);

    return {
      run: async (...args: any[]): Promise<any> => {
        const res = await query(pgSql, args);
        return {
          changes: res.rowCount || 0,
          rowCount: res.rowCount || 0,
          rows: res.rows || [],
        };
      },

      get: async (...args: any[]): Promise<any> => {
        const res = await query(pgSql, args);
        return res.rows[0] || null;
      },

      all: async (...args: any[]): Promise<any> => {
        const res = await query(pgSql, args);
        return res.rows || [];
      },
    };
  }

  transaction<T>(fn: (client?: any) => Promise<T> | T): () => Promise<T> {
    return () => {
      return transaction((client) => {
        return fn(client);
      });
    };
  }
}

export const db = new PostgresDatabase();

export async function initDb(): Promise<void> {
  try {
    dbReady = false;
    dbLogger.info("🚀 Initializing PostgreSQL Database Connection & Schemas...");

    // 1. Connect PostgreSQL
    await connect();

    // 2. Run migrations
    const appliedMigrations = await runPendingMigrations();
    if (appliedMigrations.length > 0) {
      dbLogger.info({ count: appliedMigrations.length, migrations: appliedMigrations }, "✅ PostgreSQL schema migrations applied successfully");
    } else {
      dbLogger.info("✨ PostgreSQL database schema is up-to-date");
    }

    // 3. Verify required tables exist
    await verifyRequiredTables();

    // 4. Run seed data
    await runSeeds();
    dbLogger.info("🌱 Database seeds executed successfully");

    // 5. Connect Redis & verify with PING (Phase 13D)
    dbLogger.info("🔴 Initializing Upstash Redis Connection...");
    await connectRedis();
    const pingResult = await redis.ping();
    dbLogger.info({ pingResult }, "✅ Redis connection verified with PING");

    // 6. Mark DB initialized and ready
    dbReady = true;
  } catch (err: any) {
    dbReady = false;
    dbLogger.error({ err }, "❌ Failed to initialize database infrastructure");
    throw err;
  }
}

export {
  pool,
  query,
  transaction,
  connect,
  disconnect,
  healthCheck,
  isPostgresConnected,
  connectRedis,
  disconnectRedis,
  redis,
  healthCheckRedis,
  isRedisConnected,
};
export default db;
