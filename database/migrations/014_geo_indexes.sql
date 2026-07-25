-- Migration 014: High-load geo-spatial and unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_from_to ON likes (from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles (location_lat, location_lon) WHERE is_visible = TRUE;
