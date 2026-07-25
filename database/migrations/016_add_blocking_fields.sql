-- Migration 016: Add is_blocked and blocked_reason columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
