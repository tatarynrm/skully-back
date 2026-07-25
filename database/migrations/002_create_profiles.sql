-- Migration 002: Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL CHECK (age >= 16 AND age <= 99),
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    search_gender VARCHAR(20) NOT NULL CHECK (search_gender IN ('MALE', 'FEMALE', 'ANY')),
    bio TEXT,
    city VARCHAR(100),
    location_lat NUMERIC(9,6),
    location_lon NUMERIC(9,6),
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles(gender, search_gender, is_visible);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
