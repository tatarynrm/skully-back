-- Migration 008: Remove self-likes and self-matches
DELETE FROM likes WHERE from_user_id = to_user_id;
DELETE FROM matches WHERE user1_id = user2_id;
