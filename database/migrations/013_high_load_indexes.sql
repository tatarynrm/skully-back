-- Migration 013: High-load optimization indexes for ultra-fast query execution
CREATE INDEX IF NOT EXISTS idx_likes_from_to_action ON likes(from_user_id, to_user_id, action);
CREATE INDEX IF NOT EXISTS idx_likes_to_action_created ON likes(to_user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_daily_count ON likes(from_user_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_profiles_geo_gender ON profiles(is_visible, gender, search_gender, age);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
