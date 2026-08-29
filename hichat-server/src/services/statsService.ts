import {
  userRepository,
  roomRepository,
  messageRepository,
  UserRepository,
  RoomRepository,
  MessageRepository,
} from "../repositories";

export class StatsServiceClass {
  constructor(
    private userRepo: UserRepository = userRepository,
    private roomRepo: RoomRepository = roomRepository,
    private msgRepo: MessageRepository = messageRepository
  ) {}

  async getSystemStats(): Promise<{ usersCount: number; roomsCount: number; messagesCount: number; timestamp: string }> {
    const [usersCount, roomsCount, messagesCount] = await Promise.all([
      this.userRepo.count(),
      this.roomRepo.count(),
      this.msgRepo.count(),
    ]);

    return {
      usersCount: Number(usersCount || 0),
      roomsCount: Number(roomsCount || 0),
      messagesCount: Number(messagesCount || 0),
      timestamp: new Date().toISOString(),
    };
  }
}

export const StatsService = new StatsServiceClass();
