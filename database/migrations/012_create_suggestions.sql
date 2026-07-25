-- Migration 012: Suggestions table for user feedback and proposals
CREATE TABLE IF NOT EXISTS suggestions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggestion TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suggestions_user ON suggestions(user_id);
