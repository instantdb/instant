-- TODO: Run in production with `create index concurrently` before running this migration

create extension if not exists btree_gist;
create extension if not exists pg_trgm;

create index if not exists triples_string_trgm_gist_idx on triples using gist (
    app_id,
    attr_id,
    triples_extract_string_value(value) gist_trgm_ops,
    entity_id
  )
  where ave and checked_data_type = 'string';

create index if not exists triples_number_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_number_value(value),
    entity_id
  )
  where ave and checked_data_type = 'number';

create index if not exists triples_boolean_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_boolean_value(value),
    entity_id
  )
  where ave and checked_data_type = 'boolean';

create index if not exists triples_date_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_date_value(value),
    entity_id
  )
  where ave and checked_data_type = 'date';
