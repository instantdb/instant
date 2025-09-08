-- Drop the old per-row triggers that will be replaced by
-- per-statement triggers
drop trigger insert_files_to_sweep_trigger on triples;
drop trigger update_files_to_sweep_trigger on triples;

drop function create_file_to_sweep();
drop function create_file_to_sweep_on_update();

create or replace function triples_delete_batch_trigger()
returns trigger as $$
begin
  -- Don't let this trigger cause itself to fire
  if pg_trigger_depth() > 1 then
      return null;
  end if;

  insert into app_files_to_sweep (app_id, location_id)
    select app_id, value #>> '{}' as location_id
    from oldrows
    -- This should match the attr_id for $files.location-id
    where attr_id = '96653230-13ff-ffff-2a34-b40fffffffff'
    on conflict do nothing;

  return null;
end;
$$ language plpgsql;

create or replace function triples_column_size(t public.triples)
returns int as $$
                             -- add the extra 4 bytes for the pg_size column
  select pg_column_size(t); -- + case when t.pg_size is null then 4 else 0 end;
$$ language sql stable;

create or replace function triples_insert_batch_trigger()
returns trigger as $$
begin
  -- Don't let this trigger cause itself to fire
  if pg_trigger_depth() > 1 then
      return null;
  end if;

  -- Update pg_size on triples
  update triples t
     set pg_size = triples_column_size(t)
    from newrows n
   where t.app_id = n.app_id
     and t.entity_id = n.entity_id
     and t.attr_id = n.attr_id
     and t.value_md5 = n.value_md5;

  return null;
end;
$$ language plpgsql;

create or replace function triples_update_batch_trigger()
returns trigger as $$
begin
  -- Don't let this trigger cause itself to fire
  if pg_trigger_depth() > 1 then
      return null;
  end if;

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

  update triples t
     set pg_size = triples_column_size(t)
    from newrows s
  where s.app_id = t.app_id
    and s.entity_id = t.entity_id
    and s.attr_id = t.attr_id
    and s.value_md5 = t.value_md5
    and triples_column_size(t) is distinct from t.pg_size;


  return null;
end;
$$ language plpgsql;

create or replace trigger triples_batched_after_insert
  after insert on triples
  referencing new table as newrows
  for each statement
  execute function triples_insert_batch_trigger();

create or replace trigger triples_batched_after_update
  after update on triples
  referencing new table as newrows old table as oldrows
  for each statement
  execute function triples_update_batch_trigger();
create or replace trigger triples_batched_after_update
  after update on triples
  referencing new table as newrows old table as oldrows
  for each statement
  execute function triples_update_batch_trigger();

create or replace trigger triples_batched_after_delete
  after delete on triples
  referencing old table as oldrows
  for each statement
  execute function triples_delete_batch_trigger();
