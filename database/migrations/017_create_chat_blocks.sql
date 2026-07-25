-- Migration 017: Create chat blocks table for online chat
CREATE TABLE IF NOT EXISTS chat_blocks (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INT REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, blocked_user_id)
);
