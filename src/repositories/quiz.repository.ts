import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface QuizCategory {
  id: number;
  name: string;
  emoji: string;
}

export interface QuizQuestion {
  id: number;
  category_id: number;
  category_name: string;
  category_emoji: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  difficulty: string;
}

export interface QuizUserStats {
  user_id: number;
  total_points: number;
  correct_answers: number;
  sessions_completed: number;
  premium_days_earned: number;
}

export interface QuizRankEntry {
  user_id: number;
  name: string;
  total_points: number;
  rank: number;
}

export interface QuizDailySession {
  id: number;
  user_id: number;
  session_date: string;
  question1_id: number;
  question2_id: number;
  category_id: number;
  both_correct: boolean;
  total_time_seconds: number | null;
  premium_awarded: boolean;
}

@Injectable()
export class QuizRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all categories with unanswered question counts for this user
   */
  async getCategories(userId: number): Promise<(QuizCategory & { unanswered: number; total: number })[]> {
    const sql = `
      SELECT
        c.id, c.name, c.emoji,
        COUNT(q.id) AS total,
        COUNT(q.id) FILTER (
          WHERE q.id NOT IN (
            SELECT question_id FROM quiz_user_answers WHERE user_id = $1
          )
        ) AS unanswered
      FROM quiz_categories c
      JOIN quiz_questions q ON q.category_id = c.id
      GROUP BY c.id, c.name, c.emoji
      ORDER BY c.id;
    `;
    const res = await this.db.query<QuizCategory & { unanswered: string; total: string }>(sql, [userId]);
    return res.rows.map(r => ({
      ...r,
      unanswered: Number(r.unanswered),
      total: Number(r.total),
    }));
  }

  /**
   * Get total questions count across all categories
   */
  async getTotalQuestionsCount(): Promise<number> {
    const res = await this.db.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM quiz_questions`, []);
    return Number(res.rows[0]?.cnt ?? 0);
  }

  /**
   * Get how many questions user has already answered
   */
  async getUserAnsweredCount(userId: number): Promise<number> {
    const res = await this.db.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM quiz_user_answers WHERE user_id = $1`,
      [userId],
    );
    return Number(res.rows[0]?.cnt ?? 0);
  }

  /**
   * Get 2 random unanswered questions from a SPECIFIC category for this user
   */
  async pickDailyQuestionsByCategory(userId: number, categoryId: number): Promise<QuizQuestion[]> {
    const sql = `
      SELECT q.id, q.category_id, c.name AS category_name, c.emoji AS category_emoji,
             q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
             q.correct_option, q.difficulty
      FROM quiz_questions q
      JOIN quiz_categories c ON c.id = q.category_id
      WHERE q.category_id = $2
        AND q.id NOT IN (
          SELECT question_id FROM quiz_user_answers WHERE user_id = $1
        )
      ORDER BY RANDOM()
      LIMIT 2;
    `;
    const res = await this.db.query<QuizQuestion>(sql, [userId, categoryId]);
    return res.rows;
  }

  /**
   * Get 2 random unanswered questions from a random category for this user
   */
  async pickDailyQuestions(userId: number): Promise<QuizQuestion[]> {
    // Pick a random category that has >= 2 unanswered questions for this user
    const catSql = `
      SELECT q.category_id, COUNT(*) AS cnt
      FROM quiz_questions q
      WHERE q.id NOT IN (
        SELECT question_id FROM quiz_user_answers WHERE user_id = $1
      )
      GROUP BY q.category_id
      HAVING COUNT(*) >= 2
      ORDER BY RANDOM()
      LIMIT 1;
    `;
    const catRes = await this.db.query<{ category_id: number; cnt: string }>(catSql, [userId]);

    let categoryId: number | null = catRes.rows[0]?.category_id ?? null;

    // Fallback: if no category with 2 unanswered, pick any 2 random questions
    if (!categoryId) {
      const fallbackSql = `
        SELECT q.id, q.category_id, c.name AS category_name, c.emoji AS category_emoji,
               q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
               q.correct_option, q.difficulty
        FROM quiz_questions q
        JOIN quiz_categories c ON c.id = q.category_id
        ORDER BY RANDOM()
        LIMIT 2;
      `;
      const res = await this.db.query<QuizQuestion>(fallbackSql, []);
      return res.rows;
    }

    const sql = `
      SELECT q.id, q.category_id, c.name AS category_name, c.emoji AS category_emoji,
             q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
             q.correct_option, q.difficulty
      FROM quiz_questions q
      JOIN quiz_categories c ON c.id = q.category_id
      WHERE q.category_id = $2
        AND q.id NOT IN (
          SELECT question_id FROM quiz_user_answers WHERE user_id = $1
        )
      ORDER BY RANDOM()
      LIMIT 2;
    `;
    const res = await this.db.query<QuizQuestion>(sql, [userId, categoryId]);
    return res.rows;
  }

  /**
   * Check if user already has a session today
   */
  async getTodaySession(userId: number): Promise<QuizDailySession | null> {
    const sql = `
      SELECT * FROM quiz_daily_sessions
      WHERE user_id = $1
        AND session_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kyiv')::date
      LIMIT 1;
    `;
    const res = await this.db.query<QuizDailySession>(sql, [userId]);
    return res.rows[0] ?? null;
  }

  /**
   * Create a new daily session for user
   */
  async createDailySession(
    userId: number,
    q1Id: number,
    q2Id: number,
    categoryId: number,
  ): Promise<QuizDailySession> {
    const sql = `
      INSERT INTO quiz_daily_sessions (user_id, session_date, question1_id, question2_id, category_id)
      VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kyiv')::date, $2, $3, $4)
      ON CONFLICT (user_id, session_date) DO NOTHING
      RETURNING *;
    `;
    const res = await this.db.query<QuizDailySession>(sql, [userId, q1Id, q2Id, categoryId]);
    return res.rows[0];
  }

  /**
   * Complete a daily session with results
   */
  async completeDailySession(
    userId: number,
    bothCorrect: boolean,
    totalTimeSeconds: number,
    premiumAwarded: boolean,
  ): Promise<void> {
    const sql = `
      UPDATE quiz_daily_sessions
      SET both_correct = $2, total_time_seconds = $3, premium_awarded = $4
      WHERE user_id = $1
        AND session_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kyiv')::date;
    `;
    await this.db.query(sql, [userId, bothCorrect, totalTimeSeconds, premiumAwarded]);
  }

  /**
   * Record a user's answer to a question
   */
  async recordAnswer(userId: number, questionId: number, isCorrect: boolean): Promise<void> {
    const sql = `
      INSERT INTO quiz_user_answers (user_id, question_id, is_correct)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, question_id) DO NOTHING;
    `;
    await this.db.query(sql, [userId, questionId, isCorrect]);
  }

  /**
   * Get or create user stats
   */
  async getUserStats(userId: number): Promise<QuizUserStats> {
    const sql = `
      INSERT INTO quiz_user_stats (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING;
      SELECT * FROM quiz_user_stats WHERE user_id = $1;
    `;
    const res = await this.db.query<QuizUserStats>(`SELECT * FROM quiz_user_stats WHERE user_id = $1`, [userId]);
    if (!res.rows[0]) {
      await this.db.query(`INSERT INTO quiz_user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
      return { user_id: userId, total_points: 0, correct_answers: 0, sessions_completed: 0, premium_days_earned: 0 };
    }
    return res.rows[0];
  }

  /**
   * Update user stats after session
   */
  async updateUserStats(
    userId: number,
    addPoints: number,
    addCorrect: number,
    addSessions: number,
    addPremiumDays: number,
  ): Promise<void> {
    const sql = `
      INSERT INTO quiz_user_stats (user_id, total_points, correct_answers, sessions_completed, premium_days_earned, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE
      SET total_points = quiz_user_stats.total_points + $2,
          correct_answers = quiz_user_stats.correct_answers + $3,
          sessions_completed = quiz_user_stats.sessions_completed + $4,
          premium_days_earned = quiz_user_stats.premium_days_earned + $5,
          updated_at = CURRENT_TIMESTAMP;
    `;
    await this.db.query(sql, [userId, addPoints, addCorrect, addSessions, addPremiumDays]);
  }

  /**
   * Get top 10 users by points with ranking
   */
  async getTopRanking(): Promise<QuizRankEntry[]> {
    const sql = `
      SELECT qs.user_id, p.name, qs.total_points,
             RANK() OVER (ORDER BY qs.total_points DESC) AS rank
      FROM quiz_user_stats qs
      JOIN profiles p ON p.user_id = qs.user_id
      WHERE qs.total_points > 0
      ORDER BY qs.total_points DESC
      LIMIT 10;
    `;
    const res = await this.db.query<QuizRankEntry>(sql, []);
    return res.rows;
  }

  /**
   * Get user's rank position
   */
  async getUserRank(userId: number): Promise<number | null> {
    const sql = `
      SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM quiz_user_stats
        WHERE total_points > 0
      ) ranked
      WHERE user_id = $1;
    `;
    const res = await this.db.query<{ rank: number }>(sql, [userId]);
    return res.rows[0]?.rank ?? null;
  }

  /**
   * Get a specific question by ID (for session recovery)
   */
  async getQuestionById(questionId: number): Promise<QuizQuestion | null> {
    const sql = `
      SELECT q.id, q.category_id, c.name AS category_name, c.emoji AS category_emoji,
             q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
             q.correct_option, q.difficulty
      FROM quiz_questions q
      JOIN quiz_categories c ON c.id = q.category_id
      WHERE q.id = $1;
    `;
    const res = await this.db.query<QuizQuestion>(sql, [questionId]);
    return res.rows[0] ?? null;
  }
}
