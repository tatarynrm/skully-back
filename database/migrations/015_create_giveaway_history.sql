-- Migration 015: Create giveaway history table
CREATE TABLE IF NOT EXISTS giveaway_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    won_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    premium_days INT DEFAULT 2
);
