-- Remove the replica identity setting
ALTER TABLE daily_app_transactions REPLICA IDENTITY DEFAULT;

-- Allow columns to be nullable again
ALTER TABLE daily_app_transactions ALTER COLUMN is_active DROP NOT NULL;
ALTER TABLE daily_app_transactions ALTER COLUMN app_id DROP NOT NULL;
ALTER TABLE daily_app_transactions ALTER COLUMN date DROP NOT NULL;
