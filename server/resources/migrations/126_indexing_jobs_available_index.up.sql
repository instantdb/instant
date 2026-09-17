-- Run `create index concurrently indexing_jobs_available_idx on indexing_jobs (job_status) where worker_id is null;` in production first
create index if not exists indexing_jobs_available_idx on indexing_jobs (job_status) where worker_id is null;
