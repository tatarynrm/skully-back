import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient } from 'pg';

export interface ReferralEntity {
  id: number;
  referrer_user_id: number;
  referred_user_id: number;
  created_at: Date;
}

export interface ReferralWithProfile {
  id: number;
  referred_user_id: number;
  name: string;
  created_at: Date;
}

@Injectable()
export class ReferralRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Register a referral link click / new user via referral
   */
  async addReferral(referrerUserId: number, referredUserId: number, client?: PoolClient): Promise<boolean> {
    try {
      const sql = `
        INSERT INTO referrals (referrer_user_id, referred_user_id)
        VALUES ($1, $2)
        ON CONFLICT (referred_user_id) DO NOTHING
        RETURNING id;
      `;
      const res = client
        ? await client.query(sql, [referrerUserId, referredUserId])
        : await this.db.query(sql, [referrerUserId, referredUserId]);
      return (res.rows.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Count how many users this referrer has successfully invited
   */
  async countReferrals(referrerUserId: number): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS count
      FROM referrals
      WHERE referrer_user_id = $1;
    `;
    const res = await this.db.query<{ count: string }>(sql, [referrerUserId]);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get list of referred users with their profile names for display (paginated)
   */
  async getReferrals(referrerUserId: number, page: number = 1, limit: number = 10): Promise<ReferralWithProfile[]> {
    const offset = (page - 1) * limit;
    const sql = `
      SELECT r.id, r.referred_user_id, p.name, r.created_at
      FROM referrals r
      LEFT JOIN profiles p ON p.user_id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const res = await this.db.query<ReferralWithProfile>(sql, [referrerUserId, limit, offset]);
    return res.rows;
  }

  /**
   * Get total count of referrals for pagination
   */
  async countReferralsTotal(referrerUserId: number): Promise<number> {
    const sql = `SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id = $1;`;
    const res = await this.db.query<{ count: string }>(sql, [referrerUserId]);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  /**
   * Check if a referral already exists for a given referred user
   */
  async referralExists(referredUserId: number): Promise<boolean> {
    const sql = `SELECT id FROM referrals WHERE referred_user_id = $1 LIMIT 1;`;
    const res = await this.db.query<{ id: number }>(sql, [referredUserId]);
    return res.rows.length > 0;
  }

  /**
   * Get the referrer user ID for a given referred user (to avoid re-granting)
   */
  async getReferrerForUser(referredUserId: number): Promise<number | null> {
    const sql = `SELECT referrer_user_id FROM referrals WHERE referred_user_id = $1 LIMIT 1;`;
    const res = await this.db.query<{ referrer_user_id: number }>(sql, [referredUserId]);
    return res.rows[0]?.referrer_user_id ?? null;
  }
}
