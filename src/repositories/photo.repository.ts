import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface PhotoEntity {
  id: number;
  profile_id: number;
  file_id: string;
  order_index: number;
  created_at: Date;
}

@Injectable()
export class PhotoRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async findByProfileId(profileId: number, client?: PoolClient): Promise<PhotoEntity[]> {
    const sql = `
      SELECT id, profile_id, file_id, order_index, created_at
      FROM photos
      WHERE profile_id = $1
      ORDER BY order_index ASC, created_at ASC;
    `;
    const res = await this.executeQuery<PhotoEntity>(sql, [profileId], client);
    return res.rows;
  }

  async getPhotoCount(profileId: number, client?: PoolClient): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS count
      FROM photos
      WHERE profile_id = $1;
    `;
    const res = await this.executeQuery<{ count: string }>(sql, [profileId], client);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async addPhoto(profileId: number, fileId: string, orderIndex: number = 0, client?: PoolClient): Promise<PhotoEntity> {
    const count = await this.getPhotoCount(profileId, client);
    if (count >= 3) {
      throw new Error('Максимальна кількість фотографій — 3. Видаліть старе фото, щоб додати нове.');
    }

    const sql = `
      INSERT INTO photos (profile_id, file_id, order_index)
      VALUES ($1, $2, $3)
      RETURNING id, profile_id, file_id, order_index, created_at;
    `;
    const res = await this.executeQuery<PhotoEntity>(sql, [profileId, fileId, orderIndex], client);
    return res.rows[0];
  }

  async deletePhotosByProfileId(profileId: number, client?: PoolClient): Promise<number> {
    const sql = `
      DELETE FROM photos
      WHERE profile_id = $1;
    `;
    const res = await this.executeQuery(sql, [profileId], client);
    return res.rowCount || 0;
  }
}
