create or replace function public.json_uuid_to_uuid(v jsonb) returns uuid
  language sql
  parallel safe
  immutable
  as $$
   select (v->>0)::uuid
  end;
$$;

-- Create this index concurrently before running the migration
create index if not exists vae_uuid_index
  on triples(app_id, public.json_uuid_to_uuid(value), attr_id, entity_id)
  where vae;

-- Create this index concurrently before running the migration
create unique index if not exists eav_uuid_index
  on triples(app_id, entity_id, attr_id, public.json_uuid_to_uuid(value))
  where eav;
