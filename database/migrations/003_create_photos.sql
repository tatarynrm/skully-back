-- Migration 003: Create photos table
CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    profile_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_profile_id ON photos(profile_id);
