import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface IntimateProfileEntity {
  id: number;
  user_id: number;
  wishes: string | null;
  story: string | null;
  preferences: string[] | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IntimateCandidateEntity {
  intimate_profile_id: number;
  user_id: number;
  name: string;
  age: number;
  gender: string;
  city: string | null;
  wishes: string | null;
  story: string | null;
}

export interface IntimateStoryEntity {
  id: number;
  user_id: number;
  story: string;
  views_count: number;
  likes_count: number;
  created_at: Date;
  author_name: string;
  author_age: number;
  author_gender: string;
  author_city: string | null;
  author_telegram_id: number;
  comments_count: number;
}

export interface StoryCommentEntity {
  id: number;
  story_id: number;
  author_user_id: number;
  author_name: string;
  comment: string;
  created_at: Date;
}

export interface IntimateStats {
  total_stories: number;
  total_comments: number;
  my_stories_count: number;
  my_likes_received: number;
}

@Injectable()
export class IntimateRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async findByUserId(userId: number, client?: PoolClient): Promise<IntimateProfileEntity | null> {
    const sql = `
      SELECT id, user_id, wishes, story, preferences, is_active, created_at, updated_at
      FROM intimate_profiles
      WHERE user_id = $1
      LIMIT 1;
    `;
    const res = await this.executeQuery<IntimateProfileEntity>(sql, [userId], client);
    return res.rows[0] || null;
  }

  async upsert(userId: number, wishes?: string | null, story?: string | null, client?: PoolClient): Promise<IntimateProfileEntity> {
    const sql = `
      INSERT INTO intimate_profiles (user_id, wishes, story, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        wishes = COALESCE(EXCLUDED.wishes, intimate_profiles.wishes),
        story = COALESCE(EXCLUDED.story, intimate_profiles.story),
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, wishes, story, preferences, is_active, created_at, updated_at;
    `;
    const res = await this.executeQuery<IntimateProfileEntity>(sql, [userId, wishes || null, story || null], client);
    return res.rows[0];
  }

  async updatePreferences(userId: number, preferences: string[], client?: PoolClient): Promise<IntimateProfileEntity> {
    const sql = `
      INSERT INTO intimate_profiles (user_id, preferences, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        preferences = EXCLUDED.preferences,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, wishes, story, preferences, is_active, created_at, updated_at;
    `;
    const res = await this.executeQuery<IntimateProfileEntity>(sql, [userId, preferences], client);
    return res.rows[0];
  }

  async createIntimateLike(
    fromUserId: number,
    toUserId: number,
    action: 'LIKE' | 'DISLIKE',
    client?: PoolClient,
  ): Promise<void> {
    if (fromUserId === toUserId) return;

    const sql = `
      INSERT INTO intimate_likes (from_user_id, to_user_id, action)
      VALUES ($1, $2, $3)
      ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
        action = EXCLUDED.action,
        created_at = CURRENT_TIMESTAMP;
    `;
    await this.executeQuery(sql, [fromUserId, toUserId, action], client);
  }

  async findCandidates(
    userId: number,
    searchGenderPreference: string,
    userGender: string,
    limit: number = 10,
    client?: PoolClient,
  ): Promise<IntimateCandidateEntity[]> {
    const sql = `
      SELECT 
        ip.id AS intimate_profile_id,
        ip.user_id,
        p.name,
        p.age,
        p.gender,
        p.city,
        ip.wishes,
        ip.story
      FROM intimate_profiles ip
      JOIN profiles p ON p.user_id = ip.user_id
      JOIN users u ON u.id = ip.user_id
      WHERE ip.user_id <> $1
        AND p.age >= 18
        AND ip.is_active = TRUE
        AND p.is_visible = TRUE
        AND u.is_active = TRUE
        AND ($2 = 'ANY' OR p.gender = $2)
        AND (p.search_gender = 'ANY' OR p.search_gender = $3)
        AND ip.user_id NOT IN (
          SELECT to_user_id FROM intimate_likes WHERE from_user_id = $1
        )
      ORDER BY RANDOM()
      LIMIT $4;
    `;
    const res = await this.executeQuery<IntimateCandidateEntity>(
      sql,
      [userId, searchGenderPreference, userGender, limit],
      client,
    );
    return res.rows;
  }

  async createStory(userId: number, storyText: string, client?: PoolClient): Promise<IntimateStoryEntity> {
    const sql = `
      INSERT INTO intimate_stories (user_id, story)
      VALUES ($1, $2)
      RETURNING id, user_id, story, views_count, likes_count, created_at;
    `;
    const res = await this.executeQuery<IntimateStoryEntity>(sql, [userId, storyText], client);
    return res.rows[0];
  }

  async getRandomStories(
    userId: number,
    limit: number = 10,
    client?: PoolClient,
  ): Promise<IntimateStoryEntity[]> {
    const sql = `
      SELECT 
        s.id,
        s.user_id,
        s.story,
        s.views_count,
        s.likes_count,
        s.created_at,
        p.name AS author_name,
        p.age AS author_age,
        p.gender AS author_gender,
        p.city AS author_city,
        u.telegram_id AS author_telegram_id,
        (SELECT COUNT(*) FROM intimate_story_comments c WHERE c.story_id = s.id) AS comments_count
      FROM intimate_stories s
      JOIN users u ON u.id = s.user_id
      JOIN profiles p ON p.user_id = s.user_id
      WHERE u.is_active = TRUE
      ORDER BY RANDOM()
      LIMIT $1;
    `;
    const res = await this.executeQuery<IntimateStoryEntity>(sql, [limit], client);
    return res.rows;
  }

  async incrementStoryViews(storyId: number, client?: PoolClient): Promise<void> {
    const sql = `
      UPDATE intimate_stories
      SET views_count = views_count + 1
      WHERE id = $1;
    `;
    await this.executeQuery(sql, [storyId], client);
  }

  async likeStory(userId: number, storyId: number, client?: PoolClient): Promise<boolean> {
    return this.db.transaction(async (trClient) => {
      const checkSql = `SELECT id FROM intimate_story_likes WHERE user_id = $1 AND story_id = $2;`;
      const checkRes = await trClient.query(checkSql, [userId, storyId]);
      if (checkRes.rows.length > 0) {
        return false; // Already liked
      }

      await trClient.query(`INSERT INTO intimate_story_likes (user_id, story_id) VALUES ($1, $2);`, [userId, storyId]);
      await trClient.query(`UPDATE intimate_stories SET likes_count = likes_count + 1 WHERE id = $1;`, [storyId]);
      return true;
    });
  }

  async addStoryComment(
    storyId: number,
    authorUserId: number,
    commentText: string,
    client?: PoolClient,
  ): Promise<StoryCommentEntity> {
    const sql = `
      INSERT INTO intimate_story_comments (story_id, author_user_id, comment)
      VALUES ($1, $2, $3)
      RETURNING id, story_id, author_user_id, comment, created_at;
    `;
    const res = await this.executeQuery<StoryCommentEntity>(sql, [storyId, authorUserId, commentText], client);
    return res.rows[0];
  }

  async getStoryComments(storyId: number, client?: PoolClient): Promise<StoryCommentEntity[]> {
    const sql = `
      SELECT 
        c.id,
        c.story_id,
        c.author_user_id,
        p.name AS author_name,
        c.comment,
        c.created_at
      FROM intimate_story_comments c
      JOIN profiles p ON p.user_id = c.author_user_id
      WHERE c.story_id = $1
      ORDER BY c.created_at ASC;
    `;
    const res = await this.executeQuery<StoryCommentEntity>(sql, [storyId], client);
    return res.rows;
  }

  async getIntimateStats(userId: number, client?: PoolClient): Promise<IntimateStats> {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM intimate_stories) AS total_stories,
        (SELECT COUNT(*) FROM intimate_story_comments) AS total_comments,
        (SELECT COUNT(*) FROM intimate_stories WHERE user_id = $1) AS my_stories_count,
        COALESCE((SELECT SUM(likes_count) FROM intimate_stories WHERE user_id = $1), 0) AS my_likes_received;
    `;
    const res = await this.executeQuery<{
      total_stories: string;
      total_comments: string;
      my_stories_count: string;
      my_likes_received: string;
    }>(sql, [userId], client);

    const row = res.rows[0];
    return {
      total_stories: parseInt(row?.total_stories || '0', 10),
      total_comments: parseInt(row?.total_comments || '0', 10),
      my_stories_count: parseInt(row?.my_stories_count || '0', 10),
      my_likes_received: parseInt(row?.my_likes_received || '0', 10),
    };
  }
}
