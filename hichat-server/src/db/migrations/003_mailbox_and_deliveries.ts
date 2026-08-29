export const version = "003";
export const name = "mailbox_and_deliveries";

export async function up(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    CREATE TABLE IF NOT EXISTS mailbox (
      id SERIAL PRIMARY KEY,
      message_id VARCHAR(64) UNIQUE NOT NULL,
      recipient_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_username VARCHAR(64) NOT NULL,
      ciphertext TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      delivered_at TIMESTAMP WITH TIME ZONE,
      acknowledged_at TIMESTAMP WITH TIME ZONE,
      read_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_deliveries (
      message_id VARCHAR(64) PRIMARY KEY,
      sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      delivered_at TIMESTAMP WITH TIME ZONE,
      acknowledged_at TIMESTAMP WITH TIME ZONE,
      read_at TIMESTAMP WITH TIME ZONE
    );

    CREATE INDEX IF NOT EXISTS idx_mailbox_recipient_id ON mailbox(recipient_id, id ASC);
    CREATE INDEX IF NOT EXISTS idx_message_deliveries_sender ON message_deliveries(sender_id, status);
    CREATE INDEX IF NOT EXISTS idx_message_deliveries_recipient ON message_deliveries(recipient_id, status);
  `);
}

export async function down(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    DROP TABLE IF EXISTS message_deliveries;
    DROP TABLE IF EXISTS mailbox;
  `);
}
