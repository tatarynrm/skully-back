-- Migration 010: Intimate stories, comments, preferences, and stats tables
ALTER TABLE intimate_profiles ADD COLUMN IF NOT EXISTS preferences TEXT[];

CREATE TABLE IF NOT EXISTS intimate_stories (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    story TEXT NOT NULL,
    views_count INT NOT NULL DEFAULT 0,
    likes_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intimate_stories_user ON intimate_stories(user_id);

CREATE TABLE IF NOT EXISTS intimate_story_comments (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES intimate_stories(id) ON DELETE CASCADE,
    author_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_story_comments ON intimate_story_comments(story_id);

CREATE TABLE IF NOT EXISTS intimate_story_likes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    story_id INT NOT NULL REFERENCES intimate_stories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_story_like UNIQUE (user_id, story_id)
);
