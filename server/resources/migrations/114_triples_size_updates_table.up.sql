create table triples_size_updates (
  id bigserial primary key,
  -- Intentionally did not add a foreign key constraint to keep inserts fast
  app_id uuid not null,
  attr_id uuid not null,
  pg_size bigint not null,
  files_size bigint
);

-- Minimize bottleneck on generating ids. Creates gaps in ids, but
-- it's no problem for us.
alter sequence triples_size_updates_id_seq cache 128;

-- Make the autovacuum more aggressive to quickly clean up dead tuples.
ALTER TABLE triples_size_updates SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 1000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 1000,
  autovacuum_vacuum_cost_delay = 0,
  autovacuum_vacuum_cost_limit = 10000
);

-- We run this trigger instead of using a foreign key to make the
-- insert path as fast as possible. We only insert from the triples
-- trigger, so there shouldn't be a way to get an attr_id that doesn't
-- exist. This trigger is to guard against inflated sizes if we happen
-- to delete an attr and then immediately create a new attr with the same id.
-- (we don't do it for apps, because regenerating an app is less likely)
create or replace function clean_triples_size_updates()
returns trigger as $$
begin
  -- There shouldn't be enough triples_size_updates for us to need an index on attr_id
  delete from triples_size_updates where triples_size_updates.attr_id = old.id;
  return old;
end;
$$ language plpgsql;


create trigger clean_triples_size_updates_trigger
before delete on attrs
for each row
execute function clean_triples_size_updates();

create table triples_size_aggregate (
  app_id uuid not null references apps (id) on delete cascade,
  attr_id uuid not null references attrs (id) on delete cascade,
  pg_size bigint not null,
  files_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, attr_id)
);

create index on triples_size_aggregate (attr_id);

create trigger update_updated_at_trigger
before update on triples_size_aggregate
for each row
execute function update_updated_at_column();

create or replace function triples_insert_batch_trigger()
returns trigger as $$
declare
  ents_msg text;
  app_id_setting uuid;
  log_to_table_setting boolean;
begin
  select case current_setting('instant.wal_msg_app_id', true)
           when null then null
           when '' then null
           else current_setting('instant.wal_msg_app_id', true)::uuid
         end
    into app_id_setting;

  -- This is exactly the same as the update trigger, but there's
  -- not an easy way to extract it into a separate function because
  -- it references newrows
  if app_id_setting is not null then

    -- Write the entities to the wal
    with by_etype as (
      -- Forward entities
      select a.etype, n.entity_id
        from newrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
      union
      -- Ref entities
      select a.reverse_etype etype, json_uuid_to_uuid(n.value) entity_id
        from newrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
       where n.vae
    ),
    etypes as (
      select distinct etype from by_etype
    ),
    -- Map of etype to attr
    attr_map as (
      select a.etype, a.id
        from attrs a
        join etypes e on e.etype = a.etype
       where a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
         and a.cardinality = 'one'
    ),
    -- Get all of the ents, grouped by etype and entity_id
    by_entity as (
      select e.etype,
             t.entity_id,
             json_object_agg(t.attr_id::text, t.value) as attrs
        from triples t
        join by_etype e
          on t.entity_id = e.entity_id
        join attr_map a
          on a.etype = e.etype
         and t.attr_id = a.id
       where t.app_id = app_id_setting
         and t.ea
       group by e.etype, t.entity_id
    )
    select json_agg(json_build_array(etype, entity_id, attrs))::text
      into ents_msg
      from by_entity;

    select case current_setting('instant.wal_msg_log_to_table', true)
             when null then null
             when '' then null
             else current_setting('instant.wal_msg_log_to_table', true)::boolean
           end
      into log_to_table_setting;


    if ents_msg is not null then
      if log_to_table_setting is not null and log_to_table_setting then
        insert into wal_logs (id, created_at, hour_bucket, prefix, content)
             values (gen_random_uuid(), now(), date_part('hour', now() at time zone 'UTC')::int % 8, 'update_ents', ents_msg);
      else
        perform pg_logical_emit_message(true, 'update_ents', ents_msg);
      end if;
    end if;
  end if;


  insert into triples_size_updates (app_id, attr_id, pg_size, files_size)
    select n.app_id,
           n.attr_id,
           sum(pg_column_size(n.*))::bigint,
           -- This is the attr_id for $files.size
           sum(case when n.attr_id = '96653230-13ff-ffff-2a35-24609fffffff'
                    then triples_extract_number_value(n.value)
                    else 0
               end)::bigint
      from newrows n
     group by n.app_id, n.attr_id;

  return null;
end;
$$ language plpgsql;

create or replace function triples_update_batch_trigger()
returns trigger as $$
declare
  ents_msg text;
  app_id_setting uuid;
  log_to_table_setting boolean;
begin
  -- Update sweeper with deleted files
  with old_files as (
    select app_id, value #>> '{}' as location_id
     from oldrows
     where attr_id = '96653230-13ff-ffff-2a34-b40fffffffff'
  ), new_files as (
    select app_id, value #>> '{}' as location_id
     from newrows
     where attr_id = '96653230-13ff-ffff-2a34-b40fffffffff'
  )
  insert into app_files_to_sweep (app_id, location_id)
    select o.app_id, o.location_id
    from old_files o
    left join new_files n
           on o.app_id = n.app_id
          and o.location_id = n.location_id
        where o.location_id is not null and n.location_id is null
    on conflict do nothing;

  select case current_setting('instant.wal_msg_app_id', true)
           when null then null
           when '' then null
           else current_setting('instant.wal_msg_app_id', true)::uuid
         end
    into app_id_setting;

  if app_id_setting is not null then

    -- Write the entities to the wal
    with by_etype as (
      -- Forward entities
      select a.etype, n.entity_id
        from newrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
      union
      -- Ref entities
      select a.reverse_etype etype, json_uuid_to_uuid(n.value) entity_id
        from newrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
       where n.vae
    ),
    etypes as (
      select distinct etype from by_etype
    ),
    -- Map of etype to attr
    attr_map as (
      select a.etype, a.id
        from attrs a
        join etypes e on e.etype = a.etype
       where a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
         and a.cardinality = 'one'
    ),
    -- Get all of the ents, grouped by etype and entity_id
    by_entity as (
      select e.etype,
             t.entity_id,
             json_object_agg(t.attr_id::text, t.value) as attrs
        from triples t
        join by_etype e
          on t.entity_id = e.entity_id
        join attr_map a
          on a.etype = e.etype
         and t.attr_id = a.id
       where t.app_id = app_id_setting
         and t.ea
       group by e.etype, t.entity_id
    )
    select json_agg(json_build_array(etype, entity_id, attrs))::text
      into ents_msg
      from by_entity;

    select case current_setting('instant.wal_msg_log_to_table', true)
             when null then null
             when '' then null
             else current_setting('instant.wal_msg_log_to_table', true)::boolean
           end
      into log_to_table_setting;


    if ents_msg is not null then
      if log_to_table_setting is not null and log_to_table_setting then
        insert into wal_logs (id, created_at, hour_bucket, prefix, content)
             values (gen_random_uuid(), now(), date_part('hour', now() at time zone 'UTC')::int % 8, 'update_ents', ents_msg);
      else
        perform pg_logical_emit_message(true, 'update_ents', ents_msg);
      end if;
    end if;
  end if;

  insert into triples_size_updates (app_id, attr_id, pg_size, files_size)
    select app_id, attr_id, sum(pg_delta)::bigint, sum(files_delta)::bigint
      from (select n.app_id, n.attr_id,
                    pg_column_size(n.*)::bigint as pg_delta,
                    -- This is the attr_id for $files.size
                    case when n.attr_id = '96653230-13ff-ffff-2a35-24609fffffff'
                         then triples_extract_number_value(n.value)
                         else 0
                    end as files_delta
              from newrows n
            union all
            select o.app_id, o.attr_id,
                   -pg_column_size(o.*)::bigint as pg_delta,
                   -- This is the attr_id for $files.size
                    case when o.attr_id = '96653230-13ff-ffff-2a35-24609fffffff'
                         then -triples_extract_number_value(o.value)
                         else 0
                    end as files_delta
              from oldrows o) x
     group by app_id, attr_id
    having sum(pg_delta) <> 0 or sum(files_delta) <> 0;

  return null;
end;
$$ language plpgsql;

create or replace function triples_delete_batch_trigger()
returns trigger as $$
declare
  ents_msg text;
  app_id_setting uuid;
  log_to_table_setting boolean;
begin
  -- Update sweeper with deleted files
  insert into app_files_to_sweep (app_id, location_id)
    select app_id, value #>> '{}' as location_id
    from oldrows
    -- This should match the attr_id for $files.location-id
    where attr_id = '96653230-13ff-ffff-2a34-b40fffffffff'
    on conflict do nothing;

  select case current_setting('instant.wal_msg_app_id', true)
           when null then null
           when '' then null
           else current_setting('instant.wal_msg_app_id', true)::uuid
         end
    into app_id_setting;

  if app_id_setting is not null then

    -- Write the entities to the wal
    with by_etype as (
      -- Forward entities
      select a.etype, o.entity_id
        from oldrows o
        join attrs a
          on o.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
      union
      -- Ref entities
      select a.reverse_etype etype, json_uuid_to_uuid(o.value) entity_id
        from oldrows o
        join attrs a
          on o.attr_id = a.id
         and a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
       where o.vae
    ),
    etypes as (
      select distinct etype from by_etype
    ),
    -- Map of etype to attr
    attr_map as (
      select a.etype, a.id
        from attrs a
        join etypes e on e.etype = a.etype
       where a.app_id in (app_id_setting, 'a1111111-1111-1111-1111-111111111ca7')
         and a.cardinality = 'one'
    ),
    -- Get all of the ents, grouped by etype and entity_id
    by_entity as (
      select e.etype,
             t.entity_id,
             json_object_agg(t.attr_id::text, t.value) as attrs
        from triples t
        join by_etype e
          on t.entity_id = e.entity_id
        join attr_map a
          on a.etype = e.etype
         and t.attr_id = a.id
       where t.app_id = app_id_setting
         and t.ea
       group by e.etype, t.entity_id
    )
    select json_agg(json_build_array(etype, entity_id, attrs))::text
      into ents_msg
      from by_entity;

    select case current_setting('instant.wal_msg_log_to_table', true)
             when null then null
             when '' then null
             else current_setting('instant.wal_msg_log_to_table', true)::boolean
           end
      into log_to_table_setting;


    -- Emit unconditionally when webhooks are enabled: the invalidator drops
    -- wal-records with no messages/wal-logs, and a full-entity delete leaves
    -- by_entity empty. The webhook code reconstructs the before-state from
    -- triple_changes, so an empty payload here is fine as a signal.
    if log_to_table_setting is not null and log_to_table_setting then
      insert into wal_logs (id, created_at, hour_bucket, prefix, content)
           values (gen_random_uuid(), now(), date_part('hour', now() at time zone 'UTC')::int % 8, 'delete_ents', coalesce(ents_msg, '[]'));
    else
      perform pg_logical_emit_message(true, 'delete_ents', coalesce(ents_msg, '[]'));
    end if;
  end if;

  insert into triples_size_updates (app_id, attr_id, pg_size, files_size)
    select app_id,
           attr_id,
           -sum(pg_column_size(o.*))::bigint,
           -- This is the attr_id for $files.size
           -sum(case when o.attr_id = '96653230-13ff-ffff-2a35-24609fffffff'
                     then triples_extract_number_value(o.value)
                     else 0
                end)::bigint
      from oldrows o
     group by app_id, attr_id;

  return null;
end;
$$ language plpgsql;
