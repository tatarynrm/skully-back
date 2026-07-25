-- Migration 004: Create likes table
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('LIKE', 'DISLIKE', 'SUPERLIKE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_like UNIQUE (from_user_id, to_user_id),
    CONSTRAINT check_different_users CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_from_user ON likes(from_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_to_user ON likes(to_user_id);
