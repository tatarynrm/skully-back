import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PoolClient, QueryResult } from 'pg';

export interface ProfileEntity {
  id: number;
  user_id: number;
  name: string;
  age: number;
  gender: string;
  search_gender: string;
  bio: string | null;
  city: string | null;
  location_lat: number | null;
  location_lon: number | null;
  is_visible: boolean;
  created_at: Date;
  updated_at: Date;
  distance_km?: number;
}

export interface CreateProfileData {
  userId: number;
  name: string;
  age: number;
  gender: string;
  searchGender: string;
  bio?: string;
  city?: string;
  locationLat?: number;
  locationLon?: number;
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(sql: string, params?: any[], client?: PoolClient): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(sql, params);
    }
    return this.db.query<T>(sql, params);
  }

  async findByUserId(userId: number, client?: PoolClient): Promise<ProfileEntity | null> {
    const sql = `
      SELECT id, user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, is_visible, created_at, updated_at
      FROM profiles
      WHERE user_id = $1
      LIMIT 1;
    `;
    const res = await this.executeQuery<ProfileEntity>(sql, [userId], client);
    return res.rows[0] || null;
  }

  async findById(id: number, client?: PoolClient): Promise<ProfileEntity | null> {
    const sql = `
      SELECT id, user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, is_visible, created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await this.executeQuery<ProfileEntity>(sql, [id], client);
    return res.rows[0] || null;
  }

  async upsert(data: CreateProfileData, client?: PoolClient): Promise<ProfileEntity> {
    const sql = `
      INSERT INTO profiles (user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        search_gender = EXCLUDED.search_gender,
        bio = EXCLUDED.bio,
        city = EXCLUDED.city,
        location_lat = EXCLUDED.location_lat,
        location_lon = EXCLUDED.location_lon,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, is_visible, created_at, updated_at;
    `;
    const res = await this.executeQuery<ProfileEntity>(
      sql,
      [
        data.userId,
        data.name,
        data.age,
        data.gender,
        data.searchGender,
        data.bio || null,
        data.city || null,
        data.locationLat || null,
        data.locationLon || null,
      ],
      client,
    );
    return res.rows[0];
  }

  async updateSingleField(
    userId: number,
    field: 'name' | 'age' | 'gender' | 'search_gender' | 'bio' | 'city',
    value: any,
    client?: PoolClient,
  ): Promise<ProfileEntity | null> {
    const sql = `
      UPDATE profiles
      SET ${field} = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING id, user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, is_visible, created_at, updated_at;
    `;
    const res = await this.executeQuery<ProfileEntity>(sql, [userId, value], client);
    return res.rows[0] || null;
  }

  async updateLocation(
    userId: number,
    city: string | null,
    lat: number | null,
    lon: number | null,
    client?: PoolClient,
  ): Promise<ProfileEntity | null> {
    const sql = `
      UPDATE profiles
      SET city = $2, location_lat = $3, location_lon = $4, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING id, user_id, name, age, gender, search_gender, bio, city, location_lat, location_lon, is_visible, created_at, updated_at;
    `;
    const res = await this.executeQuery<ProfileEntity>(sql, [userId, city, lat, lon], client);
    return res.rows[0] || null;
  }

  /**
   * Pure SQL candidate discovery (optimized for high-load):
   * Prioritizes same city first, then sorts by nearest distance (using Haversine formula),
   * utilizes bounding box lat/lon constraints to use indexes, and avoids ORDER BY RANDOM().
   */
  async findCandidates(
    userId: number,
    genderPreference: string,
    userGender: string,
    userLat?: number | null,
    userLon?: number | null,
    userCity?: string | null,
    limit: number = 10,
    client?: PoolClient,
  ): Promise<ProfileEntity[]> {
    const useGeo = userLat != null && userLon != null;
    // ~50km search bounding box to trigger index on (location_lat, location_lon)
    const latDelta = useGeo ? 0.45 : null;
    const lonDelta = useGeo ? 0.60 : null;

    const sql = `
      SELECT p.id, p.user_id, p.name, p.age, p.gender, p.search_gender, p.bio, p.city,
             p.location_lat, p.location_lon, p.is_visible, p.created_at, p.updated_at,
             ${useGeo ? `
             ROUND(CAST(
               6371 * acos(
                 LEAST(1.0, GREATEST(-1.0,
                   cos(radians($5::numeric)) * cos(radians(p.location_lat)) *
                   cos(radians(p.location_lon) - radians($6::numeric)) +
                   sin(radians($5::numeric)) * sin(radians(p.location_lat))
                 ))
               ) AS NUMERIC), 1)
             ` : 'NULL'} AS distance_km
      FROM profiles p
      INNER JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.from_user_id = $1 AND l.to_user_id = p.user_id
      WHERE p.user_id <> $1
        AND p.is_visible = TRUE
        AND u.is_active = TRUE
        AND l.id IS NULL
        AND ($2 = 'ANY' OR p.gender = $2)
        AND (p.search_gender = 'ANY' OR p.search_gender = $3)
        ${useGeo ? `
        AND p.location_lat BETWEEN $5::numeric - $8::numeric AND $5::numeric + $8::numeric
        AND p.location_lon BETWEEN $6::numeric - $9::numeric AND $6::numeric + $9::numeric
        ` : ''}
      ORDER BY
        -- 1. Same city gets top priority
        CASE WHEN $7::text IS NOT NULL AND LOWER(p.city) = LOWER($7::text) THEN 0 ELSE 1 END ASC,
        -- 2. Nearest distance gets second priority
        ${useGeo ? 'distance_km ASC NULLS LAST,' : ''}
        -- 3. Fast fallback sorting instead of RANDOM()
        p.id DESC
      LIMIT $4;
    `;

    const params = [
      userId,
      genderPreference,
      userGender,
      limit,
      userLat ?? null,
      userLon ?? null,
      userCity ?? null,
      latDelta,
      lonDelta,
    ];

    const res = await this.executeQuery<ProfileEntity>(sql, params, client);
    return res.rows;
  }
}
