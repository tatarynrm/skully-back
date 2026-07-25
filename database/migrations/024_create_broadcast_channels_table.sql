CREATE TABLE IF NOT EXISTS broadcast_channels (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    type VARCHAR(50) NOT NULL, -- 'channel' or 'group'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend broadcasts table if not already supporting channel list
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS target_channels JSONB;
