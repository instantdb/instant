create table app_files_to_copy (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null,
  location_id text not null,
  machine_id uuid,
  -- Non-null marks the file as failed; failed files are skipped when claiming.
  error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- High-churn queue table (insert -> claim/update -> delete). Make autovacuum
-- aggressive so dead tuples get reclaimed quickly and the table stays fast.
alter table app_files_to_copy set (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 1000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 1000,
  autovacuum_vacuum_cost_delay = 0,
  autovacuum_vacuum_cost_limit = 10000
);

create trigger update_updated_at_trigger
  before update on app_files_to_copy for each row
  execute function update_updated_at_column();

-- Claim unclaimed, not-yet-failed files.
create index app_files_to_copy_unclaimed_idx on app_files_to_copy (id)
  where machine_id is null and error is null;

-- Reclaim files whose owning machine went away (stale updated_at).
create index app_files_to_copy_stale_idx on app_files_to_copy (updated_at)
  where machine_id is not null and error is null;
