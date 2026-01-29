CREATE TABLE clone_app_jobs (
  job_id uuid PRIMARY KEY,
  old_app_id uuid NOT NULL,
  new_app_id uuid NOT NULL,
  new_title text,
  creator_email text,
  batch_size integer NOT NULL,
  workers integer NOT NULL,
  total_triples bigint,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE clone_app_progress (
  job_id uuid NOT NULL,
  worker_id integer NOT NULL,
  rows_copied bigint NOT NULL DEFAULT 0,
  last_entity_id uuid,
  last_attr_id uuid,
  last_value_md5 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  done boolean NOT NULL DEFAULT false,
  PRIMARY KEY (job_id, worker_id)
);

CREATE INDEX clone_app_progress_job_id_idx ON clone_app_progress (job_id);

CREATE UNLOGGED TABLE clone_app_attr_map (
  job_id uuid NOT NULL,
  old_id uuid NOT NULL,
  new_id uuid NOT NULL,
  PRIMARY KEY (job_id, old_id)
);

CREATE UNLOGGED TABLE clone_app_ident_map (
  job_id uuid NOT NULL,
  old_id uuid NOT NULL,
  new_id uuid NOT NULL,
  PRIMARY KEY (job_id, old_id)
);
