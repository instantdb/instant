create or replace function public.json_null_to_null(v jsonb) returns jsonb
  language sql immutable
  as $$
    select case
      when v = 'null'::jsonb then null
      else v
  end;
$$;

create unique index if not exists av_ignore_nulls_index
  on triples(app_id, attr_id, json_null_to_null(value))
  include (entity_id)
  where av;

drop index av_index;

alter index av_ignore_nulls_index rename to av_index;
