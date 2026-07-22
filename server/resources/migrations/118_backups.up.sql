create table app_backups(
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  isn isn,
  backup_at timestamptz not null,
  storage_prefix text not null,
  files_size bigint,
  db_size bigint,
  uncompressed_size bigint,
  description text,
  expires_at timestamptz
);

create index on app_backups(app_id);

create table backup_jobs(
  id uuid primary key,
  isn isn not null,
  backup_at timestamptz not null,
  machine_id uuid not null,
  max_app_id uuid,
  triples_processed bigint,
  apps_processed bigint,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);


create trigger update_updated_at_trigger
before update on backup_jobs
for each row
execute function update_updated_at_column();
