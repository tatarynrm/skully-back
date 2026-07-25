import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface MatchEntity {
  id: number;
  user1_id: number;
  user2_id: number;
  is_notified: boolean;
  created_at: Date;
}

export interface MatchWithProfileEntity {
  match_id: number;
  matched_user_id: number;
  telegram_id: number;
  username: string | null;
  name: string;
  age: number;
  gender: string;
  bio: string | null;
  city: string | null;
  matched_at: Date;
}

export interface UnnotifiedMatchNotificationDetails {
  match_id: number;
  user1_id: number;
  user1_telegram_id: number;
  user1_name: string;
  user1_username: string | null;
  user2_id: number;
  user2_telegram_id: number;
  user2_name: string;
  user2_username: string | null;
}

@Injectable()
export class MatchRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async createMatch(userAId: number, userBId: number, client?: PoolClient): Promise<MatchEntity | null> {
    if (userAId === userBId) {
      return null;
    }

    const user1Id = Math.min(userAId, userBId);
    const user2Id = Math.max(userAId, userBId);

    const sql = `
      INSERT INTO matches (user1_id, user2_id, is_notified)
      VALUES ($1, $2, FALSE)
      ON CONFLICT (user1_id, user2_id) DO NOTHING
      RETURNING id, user1_id, user2_id, is_notified, created_at;
    `;
    const res = await this.executeQuery<MatchEntity>(sql, [user1Id, user2Id], client);
    return res.rows[0] || null;
  }

  async getUserMatches(
    userId: number,
    limit: number = 10,
    offset: number = 0,
    client?: PoolClient,
  ): Promise<MatchWithProfileEntity[]> {
    const sql = `
      SELECT 
        m.id AS match_id,
        CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS matched_user_id,
        u.telegram_id,
        u.username,
        p.name,
        p.age,
        p.gender,
        p.bio,
        p.city,
        m.created_at AS matched_at
      FROM matches m
      JOIN users u ON u.id = CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END
      JOIN profiles p ON p.user_id = u.id
      WHERE (m.user1_id = $1 OR m.user2_id = $1)
        AND m.user1_id <> m.user2_id
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const res = await this.executeQuery<MatchWithProfileEntity>(sql, [userId, limit, offset], client);
    return res.rows;
  }

  async getMatchesCount(userId: number, client?: PoolClient): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS count
      FROM matches
      WHERE (user1_id = $1 OR user2_id = $1)
        AND user1_id <> user2_id;
    `;
    const res = await this.executeQuery<{ count: string }>(sql, [userId], client);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async getPendingUnnotifiedMatches(limit: number = 30, client?: PoolClient): Promise<UnnotifiedMatchNotificationDetails[]> {
    const sql = `
      SELECT 
        m.id AS match_id,
        m.user1_id,
        u1.telegram_id AS user1_telegram_id,
        p1.name AS user1_name,
        u1.username AS user1_username,
        m.user2_id,
        u2.telegram_id AS user2_telegram_id,
        p2.name AS user2_name,
        u2.username AS user2_username
      FROM matches m
      JOIN users u1 ON u1.id = m.user1_id
      JOIN profiles p1 ON p1.user_id = m.user1_id
      JOIN users u2 ON u2.id = m.user2_id
      JOIN profiles p2 ON p2.user_id = m.user2_id
      WHERE m.is_notified = FALSE
        AND m.user1_id <> m.user2_id
      ORDER BY m.created_at ASC
      LIMIT $1;
    `;
    const res = await this.executeQuery<UnnotifiedMatchNotificationDetails>(sql, [limit], client);
    return res.rows;
  }

  async markMatchNotified(matchId: number, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE matches
      SET is_notified = TRUE
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [matchId], client);
  }
}
