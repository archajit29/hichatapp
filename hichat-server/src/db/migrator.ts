import { query, transaction, connect, disconnect } from "./postgres";
import { logger } from "../core/logger";
import * as m001 from "./migrations/001_initial_schema";
import * as m002 from "./migrations/002_signal_protocol";
import * as m003 from "./migrations/003_mailbox_and_deliveries";
import * as m004 from "./migrations/004_refresh_tokens";
import * as m005 from "./migrations/005_delivery_retry_tracking";

const dbLogger = logger.child({ module: "migrator" });

export interface MigrationModule {
  version: string;
  name: string;
  up: (ctx: { exec: (sql: string) => Promise<any>; query: (sql: string, params?: any[]) => Promise<any[]>; driver: string }) => Promise<void> | void;
  down: (ctx: { exec: (sql: string) => Promise<any>; query: (sql: string, params?: any[]) => Promise<any[]>; driver: string }) => Promise<void> | void;
}

export const MIGRATIONS: MigrationModule[] = [
  m001,
  m002,
  m003,
  m004,
  m005,
].sort((a, b) => a.version.localeCompare(b.version));

export async function initMigrationTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      migration_name VARCHAR(128) NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Retrieves list of already executed migration versions.
 */
export async function getExecutedMigrations(): Promise<Array<{ version: string; migration_name: string; executed_at: string }>> {
  const res = await query("SELECT version, migration_name, executed_at FROM schema_migrations ORDER BY version ASC");
  return res.rows || [];
}

/**
 * Runs all pending migrations in ascending order inside transaction blocks.
 */
export async function runPendingMigrations(): Promise<string[]> {
  await initMigrationTable();
  const executed = await getExecutedMigrations();
  const executedVersions = new Set(executed.map((m) => m.version));
  const applied: string[] = [];
  const driver = "postgres";

  for (const migration of MIGRATIONS) {
    if (!executedVersions.has(migration.version)) {
      dbLogger.info({ version: migration.version, name: migration.name }, `⏳ Applying PostgreSQL migration ${migration.version}_${migration.name}...`);

      try {
        await transaction(async (client) => {
          const ctx = {
            exec: async (sql: string) => {
              return await client.query(sql);
            },
            query: async (sql: string, params: any[] = []) => {
              const res = await client.query(sql, params);
              return res.rows || [];
            },
            driver,
          };

          await migration.up(ctx);

          await client.query(
            "INSERT INTO schema_migrations (version, migration_name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
            [migration.version, migration.name]
          );
        });

        applied.push(`${migration.version}_${migration.name}`);
        dbLogger.info({ version: migration.version, name: migration.name }, `✅ Applied PostgreSQL migration ${migration.version}_${migration.name}`);
      } catch (err: any) {
        dbLogger.error({ version: migration.version, name: migration.name, err }, `❌ Migration ${migration.version}_${migration.name} failed! Rolled back.`);
        throw new Error(`Migration ${migration.version}_${migration.name} failed: ${err.message}`);
      }
    }
  }

  if (applied.length === 0) {
    dbLogger.info("PostgreSQL database schema is up to date (no pending migrations).");
  }

  return applied;
}

/**
 * Rolls back the latest applied migration.
 */
export async function rollbackLastMigration(): Promise<string | null> {
  await initMigrationTable();
  const executed = await getExecutedMigrations();
  if (executed.length === 0) {
    console.log("No migrations to rollback.");
    return null;
  }

  const lastExecuted = executed[executed.length - 1];
  const migration = MIGRATIONS.find((m) => m.version === lastExecuted.version);

  if (!migration) {
    throw new Error(`Migration file for executed version ${lastExecuted.version} not found!`);
  }

  const driver = "postgres";
  console.log(`⏳ Rolling back migration ${migration.version}_${migration.name}...`);

  await transaction(async (client) => {
    const ctx = {
      exec: async (sql: string) => client.query(sql),
      query: async (sql: string, params: any[] = []) => {
        const res = await client.query(sql, params);
        return res.rows || [];
      },
      driver,
    };

    await migration.down(ctx);

    await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
  });

  console.log(`✅ Rolled back migration ${migration.version}_${migration.name}`);
  return `${migration.version}_${migration.name}`;
}

/**
 * Rolls back migrations down to a specific target version (exclusive).
 */
export async function rollbackToVersion(targetVersion: string): Promise<string[]> {
  await initMigrationTable();
  const executed = await getExecutedMigrations();
  const executedDesc = [...executed].reverse();
  const rolledBack: string[] = [];
  const driver = "postgres";

  for (const execRecord of executedDesc) {
    if (execRecord.version <= targetVersion) {
      break;
    }

    const migration = MIGRATIONS.find((m) => m.version === execRecord.version);
    if (!migration) {
      throw new Error(`Migration module for version ${execRecord.version} not found!`);
    }

    console.log(`⏳ Rolling back migration ${migration.version}_${migration.name}...`);

    await transaction(async (client) => {
      const ctx = {
        exec: async (sql: string) => client.query(sql),
        query: async (sql: string, params: any[] = []) => {
          const res = await client.query(sql, params);
          return res.rows || [];
        },
        driver,
      };

      await migration.down(ctx);

      await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
    });

    rolledBack.push(`${migration.version}_${migration.name}`);
    console.log(`✅ Rolled back migration ${migration.version}_${migration.name}`);
  }

  return rolledBack;
}

/**
 * Returns applied and pending migration version lists.
 */
export async function getMigrationStatus(): Promise<{ applied: string[]; pending: string[] }> {
  await initMigrationTable();
  const executed = await getExecutedMigrations();
  const executedVersions = new Set(executed.map((m) => m.version));
  const applied: string[] = [];
  const pending: string[] = [];

  for (const m of MIGRATIONS) {
    if (executedVersions.has(m.version)) {
      applied.push(m.version);
    } else {
      pending.push(m.version);
    }
  }

  return { applied, pending };
}

/**
 * Displays status of all migrations.
 */
export async function printMigrationStatus() {
  await initMigrationTable();
  const executed = await getExecutedMigrations();
  const executedMap = new Map(executed.map((m) => [m.version, m]));

  console.log("\n" + "=".repeat(80));
  console.log("POSTGRESQL DATABASE SCHEMA MIGRATIONS STATUS");
  console.log("=".repeat(80));
  console.log("Version | Migration Name             | Status   | Executed At");
  console.log("-".repeat(80));

  for (const m of MIGRATIONS) {
    const record = executedMap.get(m.version);
    const status = record ? "APPLIED" : "PENDING";
    const executedAt = record?.executed_at || "-";
    console.log(
      `${m.version.padEnd(7)} | ${m.name.padEnd(26)} | ${status.padEnd(8)} | ${executedAt}`
    );
  }
  console.log("=".repeat(80) + "\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "up";

  (async () => {
    try {
      await connect();
      if (command === "up" || command === "migrate") {
        await runPendingMigrations();
      } else if (command === "down" || command === "rollback") {
        const toArg = args.find((a) => a.startsWith("--to="));
        if (toArg) {
          const targetVersion = toArg.split("=")[1];
          await rollbackToVersion(targetVersion);
        } else {
          await rollbackLastMigration();
        }
      } else if (command === "status") {
        await printMigrationStatus();
      } else {
        console.error(`Unknown migration command: ${command}`);
        console.error("Usage: bun src/db/migrator.ts [up|down|rollback|status] [--to=version]");
        process.exit(1);
      }
    } catch (err: any) {
      console.error("❌ Migration error:", err.message);
      process.exit(1);
    } finally {
      await disconnect();
    }
  })();
}
