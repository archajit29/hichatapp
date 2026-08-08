import { Database } from "bun:sqlite";
import path from "path";

const dbPath = path.join(__dirname, "../../hichat.db");
export const db = new Database(dbPath, { create: true });

// Enable Foreign Keys & WAL mode for high performance
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      public_key TEXT,
      avatar_url TEXT,
      status TEXT DEFAULT 'online',
      custom_status TEXT DEFAULT 'Available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_private INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_a, user_b),
      FOREIGN KEY (user_a) REFERENCES users(id),
      FOREIGN KEY (user_b) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_username TEXT NOT NULL,
      payloads TEXT NOT NULL, -- JSON string mapping user_id/socket_id to ciphertext
      media_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance Indexes for Dubai Enterprise Scale
    CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  try { db.exec("ALTER TABLE messages ADD COLUMN file_name TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN file_size INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0;"); } catch (e) {}

  // Insert default channels
  const defaultRooms = [
    { id: "general", name: "general", description: "General enterprise chatter", is_private: 0 },
    { id: "tech-lounge", name: "tech-lounge", description: "Bun, Hono & High-Perf Systems", is_private: 0 },
    { id: "crypto-security", name: "crypto-security", description: "E2EE, Security & Web Crypto", is_private: 0 },
    { id: "dubai-tech-hub", name: "dubai-tech-hub", description: "UAE & Middle East Tech Lounge", is_private: 0 },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rooms (id, name, description, is_private)
    VALUES ($id, $name, $description, $is_private)
  `);

  for (const room of defaultRooms) {
    stmt.run({
      $id: room.id,
      $name: room.name,
      $description: room.description,
      $is_private: room.is_private,
    });
  }

  console.log("✅ SQLite Database initialized with Enterprise Indexes & DM Support!");
}
