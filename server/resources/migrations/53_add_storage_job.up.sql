create type storage_sweeper_job_status as enum (
  'waiting',
  'processing', 
  'completed',
  'errored'
);

create table storage_sweeper_jobs (
  id uuid primary key,
  job_status storage_sweeper_job_status not null,
  job_stage text not null,
  app_id uuid,
  num_files_claimed integer,
  worker_id text,
  error text,
  created_at timestamp with time zone not null default now(),
  done_at timestamp with time zone
);

alter table app_files_to_sweep add column 
  processing_job_id uuid references storage_sweeper_jobs(id);

create index on app_files_to_sweep (processing_job_id) 
  where processing_job_id is not null;

CREATE INDEX app_files_to_sweep_created_at_idx ON app_files_to_sweep (created_at);
