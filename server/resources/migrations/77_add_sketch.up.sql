create table attr_sketches (
  id uuid primary key,
  app_id uuid not null references apps (id) on delete cascade,
  attr_id uuid not null references attrs (id) on delete cascade,
  width integer not null,
  depth integer not null,
  total bigint not null,
  total_not_binned bigint not null,
  -- maybe we should make bins nullable so that we can avoid storing
  -- zeroes
  bins bigint[] not null,
  max_lsn pg_lsn,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (app_id, attr_id)
);

-- unique constraint creates index we can use for cascade deletes on app
-- add index for cascade deletes on attr
create index on attr_sketches (attr_id);

create trigger update_updated_at_trigger
before update on attr_sketches
for each row
execute function update_updated_at_column();

-- This acts as a singleton table where we keep track of which lsn
-- we've completed processing. The updates to the attr_sketches will
-- happen in the same transaction where we update the wal_aggregator
-- Then on a crash, we can restart the wal from the lsn in the
-- aggregator status
create table wal_aggregator_status (
  -- Should match the name of the slot
  -- Allows us to have multiple aggregators for testing
  slot_name text primary key,
  lsn pg_lsn,
  process_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create trigger update_updated_at_trigger
before update on wal_aggregator_status
for each row
execute function update_updated_at_column();

alter table triples replica identity full;

-- same as unnest, but will not flatten a 2-dimensional array
-- select unnest_2d('{{1,2},{3,4}}') as rows
--    rows
--   ------
--    {1,2}
--    {3,4}
create or replace function unnest_2d(anyarray, out a anyarray)
  returns setof anyarray
  language plpgsql
  immutable parallel safe strict
as $$
begin
  if array_length($1, 1) is null then
    return;
  end if;

  foreach a slice 1 in array $1 loop
    return next;
  end loop;
end;
$$;
