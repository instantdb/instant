DROP INDEX app_files_to_sweep_created_at_idx;
ALTER TABLE app_files_to_sweep DROP COLUMN processing_job_id;

DROP TABLE storage_sweeper_jobs;

DROP TYPE storage_sweeper_job_status;
