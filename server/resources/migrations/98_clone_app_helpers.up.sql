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

create table clone_app_progress (
  job_id uuid not null,
  worker_id integer not null,
  rows_copied bigint not null default 0,
  last_entity_id uuid,
  last_attr_id uuid,
  last_value_md5 text,
  updated_at timestamptz not null default now(),
  done boolean not null default false,
  primary key (job_id, worker_id),
  foreign key (job_id) references clone_app_jobs (job_id) on delete cascade
);

create index clone_app_progress_job_id_idx on clone_app_progress (job_id);

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
