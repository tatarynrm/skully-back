import { Injectable } from '@nestjs/common';
import { UserRepository, UserEntity } from '../repositories/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findOrCreateUser(telegramId: number, username?: string): Promise<UserEntity> {
    let user = await this.userRepository.findByTelegramId(telegramId);
    if (!user) {
      user = await this.userRepository.create(telegramId, username);
    }
    return user;
  }

  async getUserById(id: number): Promise<UserEntity | null> {
    return this.userRepository.findById(id);
  }

  async getUserByTelegramId(telegramId: number): Promise<UserEntity | null> {
    return this.userRepository.findByTelegramId(telegramId);
  }

  async findByTelegramId(telegramId: number): Promise<UserEntity | null> {
    return this.userRepository.findByTelegramId(telegramId);
  }

  async updateUsername(userId: number, username: string | null): Promise<void> {
    await this.userRepository.updateUsername(userId, username);
  }

  async updatePhone(userId: number, phone: string): Promise<void> {
    await this.userRepository.updatePhone(userId, phone);
  }
}
