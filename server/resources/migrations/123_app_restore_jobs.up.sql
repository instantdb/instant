create table app_restore_jobs(
  id uuid primary key,
  -- The app this restore creates. Supplied by the caller or minted at upload
  -- time. No FK: the app row itself is created *during* the restore, so it
  -- doesn't exist yet when this row is inserted.
  app_id uuid not null,
  -- Exactly one of these owns the restored app (mirrors restore-from-zip).
  creator_id uuid references instant_users(id) on delete set null,
  org_id uuid references orgs(id) on delete set null,
  title text,
  -- Absolute path to the uploaded zip on the machine running the restore.
  zip_path text not null,
  job_status text not null default 'waiting',
  -- Human-readable status the dashboard shows while restoring (e.g. counts).
  progress text,
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  updated_at timestamptz not null default now()
);

create index on app_restore_jobs(app_id);

create trigger update_updated_at_trigger
before update on app_restore_jobs
for each row
execute function update_updated_at_column();
