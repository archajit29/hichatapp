export const version = "004";
export const name = "refresh_tokens";

export async function up(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) UNIQUE NOT NULL,
      family_id VARCHAR(64) NOT NULL,
      parent_token_id VARCHAR(64),
      is_revoked INTEGER NOT NULL DEFAULT 0,
      replaced_by VARCHAR(64),
      user_agent TEXT,
      ip_address VARCHAR(64),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP WITH TIME ZONE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);
  `);
}

export async function down(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    DROP TABLE IF EXISTS refresh_tokens;
  `);
}
