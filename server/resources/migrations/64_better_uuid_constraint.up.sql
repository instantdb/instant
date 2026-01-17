create or replace function public.triples_extract_uuid_value(value jsonb)
 returns uuid
 language sql
 immutable
as $$
  select case
    when jsonb_typeof(value) = 'string'
     and pg_input_is_valid(value #>> '{}', 'uuid')
    then (value #>> '{}')::uuid
    else null
  end;
$$;

create or replace function public.triples_valid_ref_value(t public.triples)
 returns boolean
 language sql
 immutable
as $$
  select case
    when t.eav or t.vae
      then public.triples_extract_uuid_value(t.value) is not null
    else true
  end;
$$;

-- We used `not valid` here to prevent a full table scan when we add the constraint
-- We need to run validate constraint in production after adding this
-- See note https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-NOTES
-- TODO: run `alter table triples validate constraint valid_value_data_type;` in production
alter table triples
  add constraint valid_ref_value
    check (public.triples_valid_ref_value(triples));
