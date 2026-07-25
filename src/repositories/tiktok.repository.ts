import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface TiktokSubmission {
  id: number;
  user_id: number;
  video_url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reject_reason: string | null;
  created_at: Date;
}

@Injectable()
export class TiktokRepository {
  constructor(private readonly db: DatabaseService) {}

  async createSubmission(userId: number, videoUrl: string): Promise<TiktokSubmission> {
    const sql = `
      INSERT INTO tiktok_submissions (user_id, video_url)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await this.db.query<TiktokSubmission>(sql, [userId, videoUrl]);
    return res.rows[0];
  }

  async getPendingSubmissions(page: number, limit: number): Promise<{ total: number; data: any[] }> {
    const offset = (page - 1) * limit;
    const countSql = `SELECT COUNT(*) FROM tiktok_submissions WHERE status = 'PENDING'`;
    const countRes = await this.db.query(countSql);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataSql = `
      SELECT t.*, u.telegram_id, u.username, p.name 
      FROM tiktok_submissions t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN profiles p ON p.user_id = t.user_id
      WHERE t.status = 'PENDING'
      ORDER BY t.created_at ASC
      LIMIT $1 OFFSET $2;
    `;
    const dataRes = await this.db.query(dataSql, [limit, offset]);
    return { total, data: dataRes.rows };
  }

  async updateStatus(id: number, status: 'APPROVED' | 'REJECTED', reason: string | null = null): Promise<TiktokSubmission> {
    const sql = `
      UPDATE tiktok_submissions
      SET status = $1, reject_reason = $2
      WHERE id = $3
      RETURNING *;
    `;
    const res = await this.db.query<TiktokSubmission>(sql, [status, reason, id]);
    return res.rows[0];
  }
}
