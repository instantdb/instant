create unique index if not exists av_index_temp_name
  on triples(app_id, attr_id, value)
  include (entity_id)
  where av;

drop index av_index;

drop function public.json_null_to_null(v jsonb);

alter index av_index_temp_name rename to av_index;
