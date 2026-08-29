import { query } from "../db/postgres";
import { User } from "./types";

export class UserRepository {
  constructor(private dbClient?: any) {}

  async findById(id: string): Promise<User | null> {
    if (this.dbClient?.prepare) {
      const row = this.dbClient.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return row || null;
    }
    const res = await query<User>("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    if (this.dbClient?.prepare) {
      const row = this.dbClient.prepare("SELECT * FROM users WHERE username = ?").get(username);
      return row || null;
    }
    const res = await query<User>("SELECT * FROM users WHERE username = $1", [username]);
    return res.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (this.dbClient?.prepare) {
      const row = this.dbClient.prepare("SELECT * FROM users WHERE email = ?").get(email);
      return row || null;
    }
    const res = await query<User>("SELECT * FROM users WHERE email = $1", [email]);
    return res.rows[0] || null;
  }

  async findByIdOrUsername(identifier: string): Promise<User | null> {
    if (this.dbClient?.prepare) {
      const row = this.dbClient.prepare("SELECT * FROM users WHERE id = ? OR username = ? LIMIT 1").get(identifier, identifier);
      return row || null;
    }
    const res = await query<User>("SELECT * FROM users WHERE id = $1 OR username = $1 LIMIT 1", [identifier]);
    return res.rows[0] || null;
  }

  async create(data: {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    public_key?: string | null;
    avatar_url?: string | null;
    status?: string;
  }): Promise<User> {
    if (this.dbClient?.prepare) {
      this.dbClient.prepare(
        "INSERT INTO users (id, username, email, password_hash, public_key, avatar_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        data.id,
        data.username,
        data.email,
        data.password_hash,
        data.public_key || null,
        data.avatar_url || null,
        data.status || "online"
      );
      return { ...data, created_at: new Date().toISOString() };
    }

    const res = await query<User>(
      `INSERT INTO users (id, username, email, password_hash, public_key, avatar_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.id,
        data.username,
        data.email,
        data.password_hash,
        data.public_key || null,
        data.avatar_url || null,
        data.status || "online",
      ]
    );

    return res.rows[0] || { ...data, created_at: new Date().toISOString() };
  }

  async updatePublicKey(id: string, publicKey: string): Promise<void> {
    if (this.dbClient?.prepare) {
      this.dbClient.prepare("UPDATE users SET public_key = ? WHERE id = ?").run(publicKey, id);
      return;
    }
    await query("UPDATE users SET public_key = $1 WHERE id = $2", [publicKey, id]);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    if (this.dbClient?.prepare) {
      this.dbClient.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
      return;
    }
    await query("UPDATE users SET status = $1 WHERE id = $2", [status, id]);
  }

  async list(): Promise<User[]> {
    if (this.dbClient?.prepare) {
      const rows = this.dbClient.prepare("SELECT id, username, email, public_key, avatar_url, status, created_at FROM users").all();
      return rows || [];
    }
    const res = await query<User>("SELECT id, username, email, public_key, avatar_url, status, created_at FROM users");
    return res.rows || [];
  }

  async delete(id: string): Promise<void> {
    if (this.dbClient?.prepare) {
      this.dbClient.prepare("DELETE FROM users WHERE id = ?").run(id);
      return;
    }
    await query("DELETE FROM users WHERE id = $1", [id]);
  }

  async count(): Promise<number> {
    if (this.dbClient?.prepare) {
      const row = this.dbClient.prepare("SELECT COUNT(*) as count FROM users").get();
      return Number(row?.count || row?.cnt || 0);
    }
    const res = await query<{ cnt: string | number; count: string | number }>("SELECT COUNT(*) as cnt FROM users");
    return Number(res.rows[0]?.cnt || res.rows[0]?.count || 0);
  }
}

export const userRepository = new UserRepository();
