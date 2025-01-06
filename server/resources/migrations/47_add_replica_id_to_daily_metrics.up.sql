-- Ensure all columns in the unique index are non-nullable
ALTER TABLE daily_app_transactions ALTER COLUMN date SET NOT NULL;
ALTER TABLE daily_app_transactions ALTER COLUMN app_id SET NOT NULL;
ALTER TABLE daily_app_transactions ALTER COLUMN is_active SET NOT NULL;

-- Set the replica identity to use the unique index
ALTER TABLE daily_app_transactions
REPLICA IDENTITY USING INDEX daily_app_transactions_date_app_id_is_active_key;
