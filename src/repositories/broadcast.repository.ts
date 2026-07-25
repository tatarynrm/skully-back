import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BroadcastRepository {
  private readonly logger = new Logger(BroadcastRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async createBroadcast(
    title: string,
    content: string,
    mediaUrl: string | null,
    mediaType: string | null,
    inlineKeyboard: any,
    targetType: string,
    targetIds: string[] | null,
    status: string,
    scheduledAt: Date | null,
    targetChannels?: string[] | null,
  ) {
    const query = `
      INSERT INTO broadcasts (title, content, media_url, media_type, inline_keyboard, target_type, target_ids, status, scheduled_at, target_channels)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const params = [
      title,
      content,
      mediaUrl,
      mediaType,
      inlineKeyboard ? JSON.stringify(inlineKeyboard) : null,
      targetType,
      targetIds ? JSON.stringify(targetIds) : null,
      status,
      scheduledAt,
      targetChannels ? JSON.stringify(targetChannels) : null,
    ];
    const res = await this.db.query(query, params);
    return res.rows[0];
  }

  async getBroadcasts(cursorId?: number, limit = 20) {
    let query = `
      SELECT b.*,
             (SELECT COUNT(*) FROM broadcast_logs l WHERE l.broadcast_id = b.id AND l.status = 'sent') as sent_count,
             (SELECT COUNT(*) FROM broadcast_logs l WHERE l.broadcast_id = b.id AND l.status = 'failed') as failed_count
      FROM broadcasts b
    `;
    const params: any[] = [];
    if (cursorId) {
      query += ` WHERE b.id < $1 `;
      params.push(cursorId);
    }
    query += ` ORDER BY b.id DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const res = await this.db.query(query, params);
    return res.rows;
  }

  async getBroadcastById(id: number) {
    const res = await this.db.query('SELECT * FROM broadcasts WHERE id = $1', [id]);
    return res.rows[0];
  }

  async updateBroadcastStatus(id: number, status: string) {
    const res = await this.db.query(
      `UPDATE broadcasts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return res.rows[0];
  }

  async logSend(broadcastId: number, telegramId: number, status: string, errorMessage?: string) {
    const query = `
      INSERT INTO broadcast_logs (broadcast_id, telegram_id, status, error_message)
      VALUES ($1, $2, $3, $4)
    `;
    await this.db.query(query, [broadcastId, telegramId, status, errorMessage || null]);
  }

  async deleteBroadcast(id: number) {
    const res = await this.db.query(`DELETE FROM broadcasts WHERE id = $1 RETURNING *`, [id]);
    return res.rows[0];
  }

  // Cursor for fetching users during broadcast
  async getTargetUsersBatch(targetType: string, targetIds: string[] | null, lastId: number, limit = 1000) {
    let query = `SELECT id, telegram_id FROM users WHERE is_active = true AND id > $1`;
    const params: any[] = [lastId];

    if (targetType === 'users' && targetIds && targetIds.length > 0) {
      // Find users with specific IDs. targetIds might be strings containing telegram_ids.
      // We assume targetIds contains telegram_id strings for simplicity.
      query += ` AND telegram_id::text = ANY($2::text[])`;
      params.push(targetIds);
    }

    query += ` ORDER BY id ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await this.db.query(query, params);
    return res.rows;
  }

  // Channel Operations
  async upsertChannel(telegramId: number, title: string, username: string | null, type: string, isActive = true) {
    const query = `
      INSERT INTO broadcast_channels (telegram_id, title, username, type, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (telegram_id) DO UPDATE
      SET title = EXCLUDED.title, username = EXCLUDED.username, type = EXCLUDED.type, is_active = EXCLUDED.is_active, updated_at = NOW()
      RETURNING *;
    `;
    const res = await this.db.query(query, [telegramId, title, username, type, isActive]);
    return res.rows[0];
  }

  async setChannelActive(telegramId: number, isActive: boolean) {
    await this.db.query(
      `UPDATE broadcast_channels SET is_active = $1, updated_at = NOW() WHERE telegram_id = $2`,
      [isActive, telegramId]
    );
  }

  async getActiveChannels() {
    const res = await this.db.query(
      `SELECT * FROM broadcast_channels WHERE is_active = true ORDER BY title ASC`
    );
    return res.rows;
  }

  async deleteChannel(id: number) {
    await this.db.query(`DELETE FROM broadcast_channels WHERE id = $1`, [id]);
  }
}
