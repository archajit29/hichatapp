import { query } from "../db/postgres";
import { Message } from "./types";

export class MessageRepository {
  async findById(id: string): Promise<Message | null> {
    const res = await query<Message>("SELECT * FROM messages WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async create(msgData: {
    id: string;
    room_id: string;
    sender_id: string;
    sender_username: string;
    payloads: string;
    media_url?: string | null;
    file_name?: string | null;
    file_size?: number | null;
  }): Promise<Message> {
    const res = await query<Message>(
      `INSERT INTO messages (id, room_id, sender_id, sender_username, payloads, media_url, file_name, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        msgData.id,
        msgData.room_id,
        msgData.sender_id,
        msgData.sender_username,
        msgData.payloads,
        msgData.media_url || null,
        msgData.file_name || null,
        msgData.file_size || null,
      ]
    );

    return res.rows[0] || { ...msgData, is_deleted: 0, created_at: new Date().toISOString() };
  }

  async listByRoom(roomId: string, limit = 50, beforeTimestamp?: string): Promise<Message[]> {
    if (beforeTimestamp) {
      const res = await query<Message>(
        `SELECT * FROM messages 
         WHERE room_id = $1 AND is_deleted = 0 AND created_at < $2
         ORDER BY created_at DESC 
         LIMIT $3`,
        [roomId, beforeTimestamp, limit]
      );
      return res.rows || [];
    }

    const res = await query<Message>(
      `SELECT * FROM messages 
       WHERE room_id = $1 AND is_deleted = 0
       ORDER BY created_at DESC 
       LIMIT $2`,
      [roomId, limit]
    );
    return res.rows || [];
  }

  async softDelete(messageId: string): Promise<void> {
    await query("UPDATE messages SET is_deleted = 1 WHERE id = $1", [messageId]);
  }

  async count(): Promise<number> {
    const res = await query<{ cnt: string | number; count: string | number }>("SELECT COUNT(*) as cnt FROM messages");
    return Number(res.rows[0]?.cnt || res.rows[0]?.count || 0);
  }
}

export const messageRepository = new MessageRepository();
