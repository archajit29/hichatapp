export const version = "002";
export const name = "signal_protocol";

export async function up(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id INTEGER NOT NULL DEFAULT 1,
      registration_id INTEGER NOT NULL,
      identity_key TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS signed_prekeys (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id INTEGER NOT NULL DEFAULT 1,
      key_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, device_id, key_id)
    );

    CREATE TABLE IF NOT EXISTS one_time_prekeys (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id INTEGER NOT NULL DEFAULT 1,
      key_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, device_id, key_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_devices_lookup ON user_devices(user_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_signed_prekeys_lookup ON signed_prekeys(user_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_lookup ON one_time_prekeys(user_id, device_id);
  `);
}

export async function down(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    DROP TABLE IF EXISTS one_time_prekeys;
    DROP TABLE IF EXISTS signed_prekeys;
    DROP TABLE IF EXISTS user_devices;
  `);
}
