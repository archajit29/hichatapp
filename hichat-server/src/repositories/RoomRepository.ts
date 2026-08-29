import { query } from "../db/postgres";
import { Room } from "./types";

export class RoomRepository {
  async findById(id: string): Promise<Room | null> {
    const res = await query<Room>("SELECT * FROM rooms WHERE id = $1", [id]);
    return res.rows[0] || null;
  }

  async findByName(name: string): Promise<Room | null> {
    const res = await query<Room>("SELECT * FROM rooms WHERE name = $1", [name]);
    return res.rows[0] || null;
  }

  async create(roomData: {
    id: string;
    name: string;
    description?: string | null;
    is_private?: number;
    created_by?: string | null;
  }): Promise<Room> {
    const res = await query<Room>(
      `INSERT INTO rooms (id, name, description, is_private, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        roomData.id,
        roomData.name,
        roomData.description || null,
        roomData.is_private || 0,
        roomData.created_by || null,
      ]
    );

    return res.rows[0] || { ...roomData, created_at: new Date().toISOString() };
  }

  async list(): Promise<Room[]> {
    const res = await query<Room>("SELECT * FROM rooms ORDER BY created_at ASC");
    return res.rows || [];
  }

  async delete(id: string): Promise<void> {
    await query("DELETE FROM rooms WHERE id = $1", [id]);
  }

  async count(): Promise<number> {
    const res = await query<{ cnt: string | number; count: string | number }>("SELECT COUNT(*) as cnt FROM rooms");
    return Number(res.rows[0]?.cnt || res.rows[0]?.count || 0);
  }
}

export const roomRepository = new RoomRepository();
