CREATE TABLE IF NOT EXISTS tiktok_submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tiktok_submissions_user_id ON tiktok_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_submissions_status ON tiktok_submissions(status);
