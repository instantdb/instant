create or replace function triples_update_batch_trigger()
returns trigger as $$
declare
  update_ents text;
  ref_ents text;
begin
  -- Don't let this trigger cause itself to fire. We let it fire
  -- twice because postgres 16 has some bug (fixed in 17) where
  -- pg_column_size on insert is different than pg_column_size on
  -- update, possibly due to how it handles nulls? If that happens,
  -- then the second time it fires it will get the right value.
  if pg_trigger_depth() > 2 then
    return null;
  end if;

  perform pg_logical_emit_message(true, 'trigger_depth', pg_trigger_depth()::text);

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

  -- Write the entities to the wal
  with by_entity as (
    select t.entity_id,
           json_build_array(json_object_agg(t.attr_id::text, t.value)) as attrs
      from triples t
      join newrows n
        on t.app_id = n.app_id
       and t.entity_id = n.entity_id
     where t.ea
     group by t.entity_id
  )
  select json_object_agg(entity_id::text, attrs)::text
    into update_ents
    from by_entity;

  if update_ents is not null then
    perform pg_logical_emit_message(true, 'update_ents', update_ents);
  end if;

  -- Write the ref entities to the wal
  with by_entity as (
    select t.entity_id,
           json_build_array(json_object_agg(t.attr_id::text, t.value)) as attrs
      from triples t
      join newrows n
        on t.app_id = n.app_id
       and n.vae
       and t.entity_id = json_uuid_to_uuid(n.value)
     where t.ea
     group by t.entity_id
  )
  select json_object_agg(entity_id::text, attrs)::text
    into ref_ents
    from by_entity;

  if ref_ents is not null then
    perform pg_logical_emit_message(true, 'ref_ents', ref_ents);
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
