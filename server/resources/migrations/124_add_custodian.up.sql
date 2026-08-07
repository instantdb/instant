create table custodian (
  id uuid primary key default gen_random_uuid(),
  -- The app being deleted. Cascade so the terminal `app` delete cleans up its
  -- own plan rows for free.
  app_id uuid not null references apps(id) on delete cascade,
  -- Set when a unit of work is scoped to a single attr (e.g. deleting one
  -- attr's triples). Null means the whole app.
  attr_id uuid references attrs(id) on delete cascade,
  -- What this row deletes: 'triples' | 'transactions' | 'attr' | 'app'
  type text not null,
  -- The step this one depends on: it can't run until that step is done. Forms a
  -- chain, e.g. for an app: app depends on transactions depends on triples. A
  -- step finishes by deleting its row; `on delete set null` then clears this
  -- pointer on the dependent, so the runnable row is simply the one with
  -- depends_on is null.
  depends_on uuid references custodian(id) on delete set null,
  -- The worker that owns this row (null when unclaimed), set on claim. Doubles
  -- as an owner tag. A worker heartbeats by bumping updated_at as it works; the
  -- reaper frees a row (clears worker_id) whose updated_at has gone stale.
  worker_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most one row per (app, type, attr). `nulls not distinct` so two whole-app
  -- rows (attr_id is null) of the same type collide instead of duplicating.
  constraint custodian_unique unique nulls not distinct (app_id, type, attr_id)
);

create index custodian_attr_id on custodian (attr_id);
create index custodian_depends_on on custodian (depends_on);

create index custodian_claimable on custodian (created_at)
  where depends_on is null and worker_id is null;

create trigger update_custodian_updated_at
before update on custodian
for each row
execute function update_updated_at_column();
