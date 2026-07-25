import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface UserEntity {
  id: number;
  telegram_id: number;
  username: string | null;
  is_active: boolean;
  is_premium: boolean;
  premium_until: Date | null;
  trial_used: boolean;
  trial_until: Date | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  phone: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async findByTelegramId(telegramId: number, client?: PoolClient): Promise<UserEntity | null> {
    const sql = `
      SELECT id, telegram_id, username, is_active, is_premium, premium_until, trial_used, trial_until, is_blocked, blocked_reason, phone, created_at, updated_at
      FROM users
      WHERE telegram_id = $1
      LIMIT 1;
    `;
    const res = await this.executeQuery<UserEntity>(sql, [telegramId], client);
    return res.rows[0] || null;
  }

  async findById(id: number, client?: PoolClient): Promise<UserEntity | null> {
    const sql = `
      SELECT id, telegram_id, username, is_active, is_premium, premium_until, trial_used, trial_until, is_blocked, blocked_reason, phone, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await this.executeQuery<UserEntity>(sql, [id], client);
    return res.rows[0] || null;
  }

  async create(telegramId: number, username?: string, client?: PoolClient): Promise<UserEntity> {
    const sql = `
      INSERT INTO users (telegram_id, username)
      VALUES ($1, $2)
      RETURNING id, telegram_id, username, is_active, is_premium, premium_until, trial_used, trial_until, is_blocked, blocked_reason, phone, created_at, updated_at;
    `;
    const res = await this.executeQuery<UserEntity>(sql, [telegramId, username || null], client);
    return res.rows[0];
  }

  async activateTrial(userId: number, client?: PoolClient): Promise<UserEntity> {
    const sql = `
      UPDATE users
      SET trial_used = TRUE,
          trial_until = CURRENT_TIMESTAMP + INTERVAL '1 day',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, telegram_id, username, is_active, is_premium, premium_until, trial_used, trial_until, is_blocked, blocked_reason, phone, created_at, updated_at;
    `;
    const res = await this.executeQuery<UserEntity>(sql, [userId], client);
    return res.rows[0];
  }

  async activatePremium(userId: number, days: number = 30, client?: PoolClient): Promise<UserEntity> {
    const sql = `
      UPDATE users
      SET is_premium = TRUE,
          premium_until = CURRENT_TIMESTAMP + ($2 || ' days')::INTERVAL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, telegram_id, username, is_active, is_premium, premium_until, trial_used, trial_until, is_blocked, blocked_reason, phone, created_at, updated_at;
    `;
    const res = await this.executeQuery<UserEntity>(sql, [userId, days], client);
    return res.rows[0];
  }

  async updatePremium(userId: number, isPremium: boolean, premiumUntil: Date | null, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE users
      SET is_premium = $2,
          premium_until = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [userId, isPremium, premiumUntil], client);
  }

  async pickRandomWinner(client?: PoolClient): Promise<{ id: number; telegram_id: number; username: string | null; name: string } | null> {
    const sql = `
      SELECT u.id, u.telegram_id, u.username, p.name
      FROM users u
      INNER JOIN profiles p ON p.user_id = u.id
      WHERE u.is_active = TRUE
        AND (u.is_premium = FALSE OR u.premium_until IS NULL OR u.premium_until < CURRENT_TIMESTAMP)
      ORDER BY RANDOM()
      LIMIT 1;
    `;
    const res = await this.executeQuery<{ id: number; telegram_id: number; username: string | null; name: string }>(sql, [], client);
    return res.rows[0] || null;
  }

  async logGiveawayWinner(userId: number, days: number, client?: PoolClient): Promise<void> {
    const sql = `
      INSERT INTO giveaway_history (user_id, premium_days)
      VALUES ($1, $2);
    `;
    await this.executeQuery(sql, [userId, days], client);
  }

  async addChatBlock(userId: number, blockedUserId: number, reason: string | null, client?: PoolClient): Promise<void> {
    const sql = `
      INSERT INTO chat_blocks (user_id, blocked_user_id, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, blocked_user_id) DO NOTHING;
    `;
    await this.executeQuery(sql, [userId, blockedUserId, reason], client);
  }

  async getChatBlockedUsers(userId: number, client?: PoolClient): Promise<number[]> {
    const sql = `
      SELECT blocked_user_id AS blocked_id FROM chat_blocks WHERE user_id = $1
      UNION
      SELECT user_id AS blocked_id FROM chat_blocks WHERE blocked_user_id = $1;
    `;
    const res = await this.executeQuery<{ blocked_id: number }>(sql, [userId], client);
    return res.rows.map((r) => r.blocked_id);
  }

  async updateUsername(userId: number, username: string | null, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE users
      SET username = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [userId, username], client);
  }

  async updatePhone(userId: number, phone: string, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE users
      SET phone = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [userId, phone], client);
  }

  async hasIntimateAccess(user: UserEntity): Promise<boolean> {
    const now = new Date();
    if (user.is_premium && user.premium_until && new Date(user.premium_until) > now) {
      return true;
    }
    if (user.trial_until && new Date(user.trial_until) > now) {
      return true;
    }
    return false;
  }
}
