create table app_backup_jobs(
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  app_backup_id uuid references app_backups(id) on delete set null,
  worker_id text,
  job_status text not null default 'waiting',
  description text,
  error text,
  work_estimate bigint,
  work_completed bigint,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  updated_at timestamptz not null default now()
);

create index on app_backup_jobs(app_id);

-- Enforces "at most one in-flight backup per app". A second enqueue while a
-- job is waiting/processing violates this and surfaces as a validation error.
create unique index app_backup_jobs_one_in_flight_per_app
  on app_backup_jobs(app_id)
  where job_status in ('waiting', 'processing');

-- Serves the worker claim query: oldest unclaimed waiting job. Ordered + partial
-- so FOR UPDATE SKIP LOCKED walks pending jobs in FIFO order with no sort, and
-- rows drop out the moment they're claimed (status -> processing).
create index app_backup_jobs_next_waiting
  on app_backup_jobs(created_at)
  where worker_id is null and job_status = 'waiting';

create trigger update_updated_at_trigger
before update on app_backup_jobs
for each row
execute function update_updated_at_column();
