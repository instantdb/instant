create table wal_logs (
  id uuid not null,
  created_at timestamp with time zone not null default now(),
  hour_bucket int not null,
  prefix text not null,
  content text not null,
  primary key (id, hour_bucket)
) partition by range (hour_bucket);

create table wal_logs_0 partition of wal_logs for values from (0) to (1);
create table wal_logs_1 partition of wal_logs for values from (1) to (2);
create table wal_logs_2 partition of wal_logs for values from (2) to (3);
create table wal_logs_3 partition of wal_logs for values from (3) to (4);
create table wal_logs_4 partition of wal_logs for values from (4) to (5);
create table wal_logs_5 partition of wal_logs for values from (5) to (6);
create table wal_logs_6 partition of wal_logs for values from (6) to (7);
create table wal_logs_7 partition of wal_logs for values from (7) to (8);

create or replace function triples_update_batch_trigger()
returns trigger as $$
declare
  ents_msg text;
  app_id_setting uuid;
  log_to_table_setting boolean;
begin
  -- Don't let this trigger cause itself to fire. We let it fire
  -- twice because postgres 16 has some bug (fixed in 17) where
  -- pg_column_size on insert is different than pg_column_size on
  -- update, possibly due to how it handles nulls? If that happens,
  -- then the second time it fires it will get the right value.
  if pg_trigger_depth() > 2 then
    return null;
  end if;

  if pg_trigger_depth() <= 1 then
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


  end if;

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
         and a.app_id = app_id_setting
      union
      -- Ref entities
      select a.reverse_etype etype, json_uuid_to_uuid(n.value) entity_id
        from newrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id = app_id_setting
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
       where a.app_id = app_id_setting
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
             values (gen_random_uuid(), now(), date_part('hour', now())::int % 8, 'update_ents', ents_msg);
      else
        perform pg_logical_emit_message(true, 'update_ents', ents_msg);
      end if;
    end if;
  end if;

  update triples t
     set pg_size = public.triples_column_size(t)
    from newrows s
  where s.app_id = t.app_id
    and s.entity_id = t.entity_id
    and s.attr_id = t.attr_id
    and s.value_md5 = t.value_md5
    and public.triples_column_size(t) is distinct from t.pg_size;

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
      select a.etype, n.entity_id
        from oldrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id = app_id_setting
      union
      -- Ref entities
      select a.reverse_etype etype, json_uuid_to_uuid(n.value) entity_id
        from oldrows n
        join attrs a
          on n.attr_id = a.id
         and a.app_id = app_id_setting
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
       where a.app_id = app_id_setting
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
             values (gen_random_uuid(), now(), date_part('hour', now())::int % 8, 'delete_ents', ents_msg);
      else
        perform pg_logical_emit_message(true, 'delete_ents', ents_msg);
      end if;
    end if;
  end if;


  return null;
end;
$$ language plpgsql;
