-- Migration 006: Update age range (16-99) and add location coordinates columns
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_age_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_age_check1;
ALTER TABLE profiles ADD CONSTRAINT profiles_age_check CHECK (age >= 16 AND age <= 99);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_lat NUMERIC(9,6);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_lon NUMERIC(9,6);
