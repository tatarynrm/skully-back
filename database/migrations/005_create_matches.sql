-- Migration 005: Create matches table
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    user1_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_match_pair UNIQUE (user1_id, user2_id),
    CONSTRAINT check_user_order CHECK (user1_id < user2_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
