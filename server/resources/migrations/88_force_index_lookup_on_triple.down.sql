create or replace function triples_update_batch_trigger()
returns trigger as $$
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
