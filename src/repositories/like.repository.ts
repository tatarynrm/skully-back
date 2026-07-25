import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface LikeEntity {
  id: number;
  from_user_id: number;
  to_user_id: number;
  action: 'LIKE' | 'DISLIKE' | 'SUPERLIKE';
  message: string | null;
  is_notified: boolean;
  created_at: Date;
}

export interface IncomingLikeDetails {
  like_id: number;
  from_user_id: number;
  name: string;
  age: number;
  gender: string;
  city: string | null;
  bio: string | null;
  message: string | null;
  liked_at: Date;
}

export interface UnnotifiedLikeDetails {
  like_id: number;
  from_user_id: number;
  from_name: string;
  to_user_id: number;
  to_telegram_id: number;
}

@Injectable()
export class LikeRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async createLike(
    fromUserId: number,
    toUserId: number,
    action: 'LIKE' | 'DISLIKE' | 'SUPERLIKE',
    message?: string | null,
    client?: PoolClient,
  ): Promise<LikeEntity | null> {
    if (fromUserId === toUserId) {
      return null;
    }

    const sql = `
      INSERT INTO likes (from_user_id, to_user_id, action, message, is_notified)
      VALUES ($1, $2, $3, $4, FALSE)
      ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
        action = EXCLUDED.action,
        message = EXCLUDED.message,
        is_notified = FALSE,
        created_at = CURRENT_TIMESTAMP
      RETURNING id, from_user_id, to_user_id, action, message, is_notified, created_at;
    `;
    const res = await this.executeQuery<LikeEntity>(
      sql,
      [fromUserId, toUserId, action, message || null],
      client,
    );
    return res.rows[0];
  }

  async checkMutualLike(userAId: number, userBId: number, client?: PoolClient): Promise<boolean> {
    const sql = `
      SELECT id FROM likes
      WHERE from_user_id = $1
        AND to_user_id = $2
        AND action IN ('LIKE', 'SUPERLIKE')
      LIMIT 1;
    `;
    const res = await this.executeQuery(sql, [userBId, userAId], client);
    return res.rows.length > 0;
  }

  async markLikesNotifiedBetweenUsers(userAId: number, userBId: number, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE likes
      SET is_notified = TRUE
      WHERE (from_user_id = $1 AND to_user_id = $2)
         OR (from_user_id = $2 AND to_user_id = $1);
    `;
    await this.executeQuery(sql, [userAId, userBId], client);
  }

  async getDailyLikesCount(userId: number, client?: PoolClient): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS count
      FROM likes
      WHERE from_user_id = $1
        AND action IN ('LIKE', 'SUPERLIKE')
        AND created_at >= CASE
            WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::time < '01:00:00'::time
            THEN ((CURRENT_DATE - INTERVAL '1 day') + TIME '01:00:00')
            ELSE (CURRENT_DATE + TIME '01:00:00')
          END;
    `;
    const res = await this.executeQuery<{ count: string }>(sql, [userId], client);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async getLikesReceivedCount(userId: number, client?: PoolClient): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS count
      FROM likes
      WHERE to_user_id = $1
        AND action IN ('LIKE', 'SUPERLIKE');
    `;
    const res = await this.executeQuery<{ count: string }>(sql, [userId], client);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async getIncomingLikes(userId: number, limit: number = 10, client?: PoolClient): Promise<IncomingLikeDetails[]> {
    const sql = `
      SELECT 
        l.id AS like_id,
        l.from_user_id,
        p.name,
        p.age,
        p.gender,
        p.city,
        p.bio,
        l.message,
        l.created_at AS liked_at
      FROM likes l
      JOIN profiles p ON p.user_id = l.from_user_id
      JOIN users u ON u.id = l.from_user_id
      WHERE l.to_user_id = $1
        AND l.action IN ('LIKE', 'SUPERLIKE')
        AND u.is_active = TRUE
        AND l.from_user_id NOT IN (
          SELECT to_user_id FROM likes WHERE from_user_id = $1
        )
      ORDER BY l.created_at DESC
      LIMIT $2;
    `;
    const res = await this.executeQuery<IncomingLikeDetails>(sql, [userId, limit], client);
    return res.rows;
  }

  async getUnnotifiedLikes(limit: number = 30, client?: PoolClient): Promise<UnnotifiedLikeDetails[]> {
    const sql = `
      SELECT 
        l.id AS like_id,
        l.from_user_id,
        p.name AS from_name,
        l.to_user_id,
        u.telegram_id AS to_telegram_id
      FROM likes l
      JOIN profiles p ON p.user_id = l.from_user_id
      JOIN users u ON u.id = l.to_user_id
      WHERE l.action IN ('LIKE', 'SUPERLIKE')
        AND l.is_notified = FALSE
        AND u.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM matches m 
          WHERE (m.user1_id = l.from_user_id AND m.user2_id = l.to_user_id)
             OR (m.user1_id = l.to_user_id AND m.user2_id = l.from_user_id)
        )
      ORDER BY l.created_at ASC
      LIMIT $1;
    `;
    const res = await this.executeQuery<UnnotifiedLikeDetails>(sql, [limit], client);
    return res.rows;
  }

  async markLikeNotified(likeId: number, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE likes
      SET is_notified = TRUE
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [likeId], client);
  }
}
