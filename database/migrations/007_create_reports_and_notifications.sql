-- Migration 007: Add like messages, notification flags, and reports table
ALTER TABLE likes ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE likes ADD COLUMN IF NOT EXISTS is_notified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_notified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
