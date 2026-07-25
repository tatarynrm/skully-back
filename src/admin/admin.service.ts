import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { GiveawayService } from '../services/giveaway.service';
import { ReferralService } from '../services/referral.service';
import { TiktokService } from '../services/tiktok.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly db: DatabaseService,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    private readonly giveawayService: GiveawayService,
    private readonly referralService: ReferralService,
    private readonly tiktokService: TiktokService,
  ) {}

  // ─── STATS ─────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [users, profiles, matches, likes, premiumUsers, giveaways, referrals] =
      await Promise.all([
        this.db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) FILTER (WHERE is_premium AND premium_until > NOW()) AS premium FROM users`),
        this.db.query(`SELECT COUNT(*) AS total FROM profiles`),
        this.db.query(`SELECT COUNT(*) AS total FROM matches`),
        this.db.query(`SELECT COUNT(*) AS total FROM likes`),
        this.db.query(`SELECT COUNT(*) AS total FROM users WHERE is_premium = TRUE AND premium_until > NOW()`),
        this.db.query(`SELECT COUNT(*) AS total FROM giveaway_history`),
        this.db.query(`SELECT COUNT(*) AS total FROM referrals`),
      ]);

    const registrationsChart = await this.db.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const recentUsers = await this.db.query(`
      SELECT u.id, u.telegram_id, u.username, u.is_active, u.is_premium, u.is_blocked, u.created_at,
             p.name, p.age, p.city, p.gender
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 10
    `);

    return {
      users: users.rows[0],
      profiles: profiles.rows[0],
      matches: matches.rows[0],
      likes: likes.rows[0],
      premiumUsers: premiumUsers.rows[0],
      giveaways: giveaways.rows[0],
      referrals: referrals.rows[0],
      registrationsChart: registrationsChart.rows,
      recentUsers: recentUsers.rows,
    };
  }

  // ─── USERS ─────────────────────────────────────────────────────────

  async getUsers(page = 1, limit = 20, search = '') {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const whereClause = searchParam
      ? `WHERE u.username ILIKE $3 OR p.name ILIKE $3 OR u.telegram_id::text ILIKE $3`
      : '';

    const countQuery = searchParam
      ? `SELECT COUNT(*) AS total FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${whereClause}`
      : `SELECT COUNT(*) AS total FROM users u LEFT JOIN profiles p ON p.user_id = u.id`;

    const dataQuery = `
      SELECT u.id, u.telegram_id, u.username, u.is_active, u.is_premium, u.premium_until,
             u.is_blocked, u.blocked_reason, u.phone, u.created_at, u.updated_at,
             u.trial_used, u.trial_until,
             p.name, p.age, p.gender, p.city, p.is_visible
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const params = searchParam ? [limit, offset, searchParam] : [limit, offset];
    const countParams = searchParam ? [searchParam] : [];

    const [data, count] = await Promise.all([
      this.db.query(dataQuery, params),
      this.db.query(countQuery, countParams),
    ]);

    return {
      users: data.rows,
      total: parseInt(count.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(parseInt(count.rows[0].total) / limit),
    };
  }

  async blockUser(userId: number, reason: string) {
    await this.db.query(
      `UPDATE users SET is_blocked = TRUE, blocked_reason = $2, updated_at = NOW() WHERE id = $1`,
      [userId, reason],
    );

    // Notify user in Telegram
    const user = await this.db.query(`SELECT telegram_id FROM users WHERE id = $1`, [userId]);
    if (user.rows[0]) {
      try {
        await this.bot.telegram.sendMessage(
          user.rows[0].telegram_id,
          `❌ <b>Ваш акаунт заблоковано!</b>\n\n📝 <b>Причина:</b> ${reason || 'Не вказано'}`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        this.logger.warn(`Could not notify blocked user: ${e.message}`);
      }
    }

    return { success: true };
  }

  async unblockUser(userId: number) {
    await this.db.query(
      `UPDATE users SET is_blocked = FALSE, blocked_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );

    const user = await this.db.query(`SELECT telegram_id FROM users WHERE id = $1`, [userId]);
    if (user.rows[0]) {
      try {
        await this.bot.telegram.sendMessage(
          user.rows[0].telegram_id,
          `✅ <b>Ваш акаунт розблоковано!</b>\n\nВи знову можете користуватися сервісом.`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        this.logger.warn(`Could not notify unblocked user: ${e.message}`);
      }
    }

    return { success: true };
  }

  async grantPremium(userId: number, days: number) {
    await this.db.query(
      `UPDATE users
       SET is_premium = TRUE,
           premium_until = COALESCE(GREATEST(premium_until, NOW()), NOW()) + ($2 || ' days')::INTERVAL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, days],
    );

    const user = await this.db.query(`SELECT telegram_id FROM users WHERE id = $1`, [userId]);
    if (user.rows[0]) {
      try {
        await this.bot.telegram.sendMessage(
          user.rows[0].telegram_id,
          `🎉 <b>Вітаємо!</b> Адміністратор нарахував вам ⭐ <b>Premium на ${days} днів</b>!\n\nПриємного користування! 🥰`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        this.logger.warn(`Could not notify premium user: ${e.message}`);
      }
    }

    return { success: true };
  }

  // ─── PROFILES ──────────────────────────────────────────────────────

  async getProfiles(page = 1, limit = 20, search = '') {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const whereClause = searchParam
      ? `WHERE p.name ILIKE $3 OR p.city ILIKE $3`
      : '';

    const countQuery = `SELECT COUNT(*) AS total FROM profiles p ${whereClause}`;
    const dataQuery = `
      SELECT p.id, p.user_id, p.name, p.age, p.gender, p.search_gender,
             p.bio, p.city, p.is_visible, p.created_at, p.updated_at,
             u.telegram_id, u.username, u.is_premium, u.is_blocked,
             (SELECT COUNT(*) FROM likes WHERE to_user_id = p.user_id) AS likes_received,
             (SELECT COUNT(*) FROM matches WHERE user1_id = p.user_id OR user2_id = p.user_id) AS matches_count,
             (SELECT url FROM photos WHERE user_id = p.user_id ORDER BY position ASC LIMIT 1) AS photo_url
      FROM profiles p
      LEFT JOIN users u ON u.id = p.user_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const params = searchParam ? [limit, offset, searchParam] : [limit, offset];
    const countParams = searchParam ? [searchParam] : [];

    const [data, count] = await Promise.all([
      this.db.query(dataQuery, params),
      this.db.query(countQuery, countParams),
    ]);

    return {
      profiles: data.rows,
      total: parseInt(count.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(parseInt(count.rows[0].total) / limit),
    };
  }

  // ─── GIVEAWAYS ─────────────────────────────────────────────────────

  async getGiveaways(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [data, count] = await Promise.all([
      this.db.query(
        `SELECT gh.id, gh.user_id, gh.premium_days, gh.created_at,
                u.telegram_id, u.username, p.name, p.city
         FROM giveaway_history gh
         LEFT JOIN users u ON u.id = gh.user_id
         LEFT JOIN profiles p ON p.user_id = gh.user_id
         ORDER BY gh.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) AS total FROM giveaway_history`),
    ]);

    return {
      giveaways: data.rows,
      total: parseInt(count.rows[0].total),
      totalPages: Math.ceil(parseInt(count.rows[0].total) / limit),
    };
  }

  async triggerManualGiveaway() {
    const channel = this.configService.get<string>('GIVEAWAY_CHANNEL', '@test_roman_noris');

    // Pick up to 3 random eligible winners
    const res = await this.db.query(`
      SELECT u.id, u.telegram_id, u.username, p.name
      FROM users u
      INNER JOIN profiles p ON p.user_id = u.id
      WHERE u.is_active = TRUE AND u.is_blocked = FALSE
        AND (u.is_premium = FALSE OR u.premium_until IS NULL OR u.premium_until < NOW())
      ORDER BY RANDOM()
      LIMIT 3
    `);

    if (res.rows.length === 0) {
      return { success: false, message: 'No eligible users found' };
    }

    const days = 2;
    const winnerNames: string[] = [];

    for (const winner of res.rows) {
      await this.db.query(
        `UPDATE users SET is_premium = TRUE, premium_until = NOW() + ($2 || ' days')::INTERVAL, updated_at = NOW() WHERE id = $1`,
        [winner.id, days],
      );
      await this.db.query(
        `INSERT INTO giveaway_history (user_id, premium_days) VALUES ($1, $2)`,
        [winner.id, days],
      );
      winnerNames.push(winner.name || `ID ${winner.telegram_id}`);

      try {
        await this.bot.telegram.sendMessage(
          winner.telegram_id,
          `🎉 <b>Вітаємо! Адміністратор видав вам ⭐ Premium на ${days} дні безкоштовно!</b> 🏆\n\nПриємного спілкування! 🥰`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        this.logger.warn(`Could not notify manual giveaway winner: ${e.message}`);
      }
    }

    const message = `🏆 <b>Ручний розіграш від адміністратора!</b>\n\n🎁 Переможці отримали ⭐ <b>Premium на ${days} дні</b>:\n${winnerNames.map((n, i) => `${i + 1}. <b>${n}</b>`).join('\n')}\n\nПреміум активовано автоматично! 🎉`;

    try {
      await this.bot.telegram.sendMessage(channel, message, { parse_mode: 'HTML' });
    } catch (e) {
      this.logger.warn(`Could not post to channel: ${e.message}`);
    }

    return { success: true, winners: winnerNames };
  }

  // ─── REFERRALS ─────────────────────────────────────────────────────

  async getReferrals(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [data, total, topReferrers] = await Promise.all([
      this.db.query(
        `SELECT r.id, r.referrer_id, r.referred_id, r.created_at,
                ru.username AS referrer_username, rp.name AS referrer_name,
                eu.username AS referred_username, ep.name AS referred_name
         FROM referrals r
         LEFT JOIN users ru ON ru.id = r.referrer_id
         LEFT JOIN profiles rp ON rp.user_id = r.referrer_id
         LEFT JOIN users eu ON eu.id = r.referred_id
         LEFT JOIN profiles ep ON ep.user_id = r.referred_id
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) AS total FROM referrals`),
      this.db.query(
        `SELECT r.referrer_id, COUNT(*) AS count, u.username, p.name
         FROM referrals r
         LEFT JOIN users u ON u.id = r.referrer_id
         LEFT JOIN profiles p ON p.user_id = r.referrer_id
         GROUP BY r.referrer_id, u.username, p.name
         ORDER BY count DESC
         LIMIT 10`,
      ),
    ]);

    return {
      referrals: data.rows,
      total: parseInt(total.rows[0].total),
      totalPages: Math.ceil(parseInt(total.rows[0].total) / limit),
      topReferrers: topReferrers.rows,
    };
  }

  // ─── BOT ───────────────────────────────────────────────────────────

  async getBotInfo() {
    const botInfo = await this.bot.telegram.getMe();
    const activeUsers = await this.db.query(
      `SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE`,
    );
    const premiumCount = await this.db.query(
      `SELECT COUNT(*) AS total FROM users WHERE is_premium = TRUE AND premium_until > NOW()`,
    );

    return {
      bot: botInfo,
      activeUsers: parseInt(activeUsers.rows[0].total),
      premiumCount: parseInt(premiumCount.rows[0].total),
    };
  }

  async broadcastMessage(text: string) {
    const users = await this.db.query(
      `SELECT telegram_id FROM users WHERE is_active = TRUE AND is_blocked = FALSE`,
    );

    let sent = 0;
    let failed = 0;

    for (const user of users.rows) {
      try {
        await this.bot.telegram.sendMessage(user.telegram_id, text, {
          parse_mode: 'HTML',
        });
        sent++;
        // Small delay to avoid Telegram rate limits
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        failed++;
      }
    }

    this.logger.log(`Broadcast complete: ${sent} sent, ${failed} failed`);
    return { success: true, sent, failed, total: users.rows.length };
  }

  // ─── DB SCHEMA ─────────────────────────────────────────────────────

  async getSchema() {
    const res = await this.db.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const schema: Record<string, Record<string, any>> = {};
    for (const row of res.rows) {
      if (!schema[row.table_name]) schema[row.table_name] = {};
      schema[row.table_name][row.column_name] = {
        data_type: row.data_type,
        is_nullable: row.is_nullable === 'YES',
      };
    }

    return schema;
  }

  async addColumn(tableName: string, columnName: string, columnType: string) {
    // Basic SQL injection prevention
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName) || !/^[a-z_][a-z0-9_]*$/i.test(columnName)) {
      throw new Error('Invalid table or column name');
    }
    await this.db.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${columnType}`);
    return { success: true };
  }

  async deleteTable(tableName: string) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) throw new Error('Invalid table name');
    await this.db.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
    return { success: true };
  }

  async deleteColumn(tableName: string, columnName: string) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName) || !/^[a-z_][a-z0-9_]*$/i.test(columnName)) {
      throw new Error('Invalid table or column name');
    }
    await this.db.query(`ALTER TABLE "${tableName}" DROP COLUMN IF EXISTS "${columnName}"`);
    return { success: true };
  }

  // ─── TIKTOK SUBMISSIONS ─────────────────────────────────────────────

  async getTiktokSubmissions(page: number, limit: number) {
    return this.tiktokService.getPendingSubmissions(page, limit);
  }

  async approveTiktokSubmission(id: number) {
    return this.tiktokService.approveSubmission(id);
  }

  async rejectTiktokSubmission(id: number, reason: string) {
    return this.tiktokService.rejectSubmission(id, reason);
  }
}
