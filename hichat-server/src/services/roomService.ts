import { roomRepository, RoomRepository, Room } from "../repositories";
import { ConflictError, NotFoundError } from "../core/errors";

export interface CreateRoomInput {
  name: string;
  description?: string;
  createdBy: string;
}

export class RoomServiceClass {
  constructor(private roomRepo: RoomRepository = roomRepository) {}

  async listRooms(): Promise<Room[]> {
    return await this.roomRepo.list();
  }

  async getRoom(roomId: string): Promise<Room | null> {
    return await this.roomRepo.findById(roomId);
  }

  async validateRoomExists(roomId: string): Promise<Room> {
    if (roomId === "general") {
      let room = await this.roomRepo.findById("general");
      if (!room) {
        room = await this.roomRepo.create({
          id: "general",
          name: "General",
          description: "General discussion for everyone",
          is_private: 0,
        });
      }
      return room;
    }

    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundError(`Room '${roomId}' does not exist`);
    }
    return room;
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const { name, description, createdBy } = input;
    const roomId = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const existing = await this.roomRepo.findById(roomId);
    if (existing) {
      throw new ConflictError("Room already exists");
    }

    return await this.roomRepo.create({
      id: roomId,
      name,
      description: description || "",
      is_private: 0,
      created_by: createdBy,
    });
  }

  async count(): Promise<number> {
    return await this.roomRepo.count();
  }
}

export const RoomService = new RoomServiceClass();
