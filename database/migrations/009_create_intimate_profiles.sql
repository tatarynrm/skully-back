-- Migration 009: Create intimate_profiles and intimate_likes tables for 18+ category
CREATE TABLE IF NOT EXISTS intimate_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wishes TEXT,
    story TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intimate_profiles_user ON intimate_profiles(user_id);

CREATE TABLE IF NOT EXISTS intimate_likes (
    id SERIAL PRIMARY KEY,
    from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('LIKE', 'DISLIKE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_intimate_like UNIQUE (from_user_id, to_user_id),
    CONSTRAINT check_intimate_different CHECK (from_user_id <> to_user_id)
);
