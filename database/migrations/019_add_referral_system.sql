-- Add referral tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_premium_granted INT DEFAULT 0;

-- Track how many referrals each user has made and if premium was already rewarded
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referrer_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
