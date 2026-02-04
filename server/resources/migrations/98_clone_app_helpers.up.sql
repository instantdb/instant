create table clone_app_jobs (
  job_id uuid primary key,
  source_app_id uuid not null,
  dest_app_id uuid not null,
  dest_title text,
  temporary_creator_id uuid not null,
  dest_creator_id uuid not null,
  batch_size integer not null,
  num_workers integer not null,
  total_triples bigint,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create unlogged table clone_app_attr_map (
  job_id uuid not null,
  old_id uuid not null,
  new_id uuid not null,
  primary key (job_id, old_id),
  foreign key (job_id) references clone_app_jobs (job_id) on delete cascade
);

create unlogged table clone_app_ident_map (
  job_id uuid not null,
  old_id uuid not null,
  new_id uuid not null,
  primary key (job_id, old_id),
  foreign key (job_id) references clone_app_jobs (job_id) on delete cascade
);
