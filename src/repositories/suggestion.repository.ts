import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface SuggestionEntity {
  id: number;
  user_id: number;
  suggestion: string;
  created_at: Date;
}

@Injectable()
export class SuggestionRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async createSuggestion(userId: number, text: string, client?: PoolClient): Promise<SuggestionEntity> {
    const sql = `
      INSERT INTO suggestions (user_id, suggestion)
      VALUES ($1, $2)
      RETURNING id, user_id, suggestion, created_at;
    `;
    const res = await this.executeQuery<SuggestionEntity>(sql, [userId, text], client);
    return res.rows[0];
  }
}
