export const version = "005";
export const name = "delivery_retry_tracking";

export async function up(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    ALTER TABLE message_deliveries ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE message_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE message_deliveries ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;
    CREATE INDEX IF NOT EXISTS idx_message_deliveries_retry ON message_deliveries(status, next_retry_at);
  `);
}

export async function down(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  try {
    await ctx.exec(`DROP INDEX IF EXISTS idx_message_deliveries_retry;`);
  } catch (_) {}
}
