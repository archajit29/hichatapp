import { query } from "../db/postgres";
import { Session } from "./types";

export class SessionRepository {
  async findSession(userA: string, userB: string): Promise<Session | null> {
    const res = await query<Session>(
      `SELECT * FROM direct_messages 
       WHERE (user_a = $1 AND user_b = $2) OR (user_a = $3 AND user_b = $4)`,
      [userA, userB, userB, userA]
    );

    return res.rows[0] || null;
  }

  async createSession(id: string, userA: string, userB: string): Promise<Session> {
    await query(
      `INSERT INTO direct_messages (id, user_a, user_b)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_a, user_b) DO NOTHING`,
      [id, userA, userB]
    );

    const found = await this.findSession(userA, userB);
    return found || { id, user_a: userA, user_b: userB, created_at: new Date().toISOString() };
  }

  async listUserSessions(userId: string): Promise<Session[]> {
    const res = await query<Session>(
      `SELECT * FROM direct_messages 
       WHERE user_a = $1 OR user_b = $2
       ORDER BY created_at DESC`,
      [userId, userId]
    );

    return res.rows || [];
  }
}

export const sessionRepository = new SessionRepository();
