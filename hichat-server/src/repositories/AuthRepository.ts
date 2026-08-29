import { transaction } from "../db/postgres";
import { User } from "./types";
import { UserRepository, userRepository } from "./UserRepository";

export class AuthRepository {
  constructor(private userRepo: UserRepository = userRepository) {}

  async findByUsername(username: string): Promise<User | null> {
    return await this.userRepo.findByUsername(username);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepo.findByEmail(email);
  }

  async registerUserInTransaction(userData: {
    id: string;
    username: string;
    email: string;
    password_hash: string;
    avatar_url?: string | null;
  }): Promise<User> {
    return await transaction(async (client) => {
      const qRes = await client.query(
        `INSERT INTO users (id, username, email, password_hash, avatar_url, status)
         VALUES ($1, $2, $3, $4, $5, 'online')
         RETURNING *`,
        [
          userData.id,
          userData.username,
          userData.email,
          userData.password_hash,
          userData.avatar_url || null,
        ]
      );
      return qRes.rows[0];
    });
  }
}

export const authRepository = new AuthRepository();
