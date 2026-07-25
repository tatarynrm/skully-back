CREATE TABLE IF NOT EXISTS broadcasts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    media_url VARCHAR(1024),
    media_type VARCHAR(50),
    inline_keyboard JSONB,
    target_type VARCHAR(50) NOT NULL,
    target_ids JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_logs (
    id SERIAL PRIMARY KEY,
    broadcast_id INT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_logs_broadcast_id ON broadcast_logs(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_status ON broadcast_logs(status);
