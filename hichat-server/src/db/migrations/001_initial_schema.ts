export const version = "001";
export const name = "initial_schema";

export async function up(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      public_key TEXT,
      avatar_url TEXT,
      status VARCHAR(32) DEFAULT 'online',
      custom_status VARCHAR(128) DEFAULT 'Available',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      description TEXT,
      is_private INTEGER DEFAULT 0,
      created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id VARCHAR(64) PRIMARY KEY,
      user_a VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_a, user_b)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      room_id VARCHAR(64) NOT NULL,
      sender_id VARCHAR(64) NOT NULL,
      sender_username VARCHAR(64) NOT NULL,
      payloads TEXT NOT NULL,
      media_url TEXT,
      file_name TEXT,
      file_size BIGINT,
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
  `);
}

export async function down(ctx: { exec: (sql: string) => Promise<any> | any; driver: string }) {
  await ctx.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS direct_messages;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS users;
  `);
}
