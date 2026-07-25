import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface ReportEntity {
  id: number;
  reporter_user_id: number;
  reported_user_id: number;
  reason: string;
  created_at: Date;
}

@Injectable()
export class ReportRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async createReport(
    reporterUserId: number,
    reportedUserId: number,
    reason: string,
    client?: PoolClient,
  ): Promise<ReportEntity> {
    const sql = `
      INSERT INTO reports (reporter_user_id, reported_user_id, reason)
      VALUES ($1, $2, $3)
      RETURNING id, reporter_user_id, reported_user_id, reason, created_at;
    `;
    const res = await this.executeQuery<ReportEntity>(sql, [reporterUserId, reportedUserId, reason], client);
    return res.rows[0];
  }
}
