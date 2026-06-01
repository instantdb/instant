-- WARNING: This rollback will fail if any app_email_senders rows have user_id = NULL.
-- Before running this migration, manually clean up or backfill null user_ids:
--   UPDATE app_email_senders SET user_id = <sentinel_user_id> WHERE user_id IS NULL;
-- Rollback is only safe if deployed before any null user_ids were written.
ALTER TABLE app_email_senders ALTER COLUMN user_id SET NOT NULL;
