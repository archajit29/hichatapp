import { query } from "../postgres";

export const defaultRooms = [
  { id: "general", name: "general", description: "General enterprise chatter", is_private: 0 },
  { id: "tech-lounge", name: "tech-lounge", description: "Bun, Hono & High-Perf Systems", is_private: 0 },
  { id: "crypto-security", name: "crypto-security", description: "E2EE, Security & Web Crypto", is_private: 0 },
  { id: "dubai-tech-hub", name: "dubai-tech-hub", description: "UAE & Middle East Tech Lounge", is_private: 0 },
  { id: "announcements", name: "announcements", description: "Official announcements", is_private: 0 },
  { id: "help", name: "help", description: "Get help from the community", is_private: 0 },
];

export async function seedDev() {
  console.log("🌱 Seeding PostgreSQL Development Database...");

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

  console.log(`✅ Development database seeded with ${defaultRooms.length} default rooms.`);
}
