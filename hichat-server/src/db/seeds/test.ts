import { query } from "../postgres";
import { defaultRooms } from "./dev";

export async function seedTest() {
  console.log("🧪 Seeding PostgreSQL Test Database Fixtures...");

  for (const room of defaultRooms) {
    try {
      await query(
        `INSERT INTO rooms (id, name, description, is_private)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [room.id, room.name, room.description, room.is_private]
      );
    } catch (_) {}
  }

  console.log("✅ Test database seeded successfully.");
}
