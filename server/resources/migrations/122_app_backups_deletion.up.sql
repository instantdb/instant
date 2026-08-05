-- Soft-delete for on-demand backups: the dashboard "delete" marks this instead
-- of removing the row. The backup's S3 objects are left to expire on their own
-- via their `expire` tag.
alter table app_backups add column deletion_marked_at timestamptz;
