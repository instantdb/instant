-- Create these concurrently before running the migration in production and run `analyze`
create index if not exists triples_string_trgm_gist_idx_no_e on triples using gist (
    app_id,
    attr_id,
    triples_extract_string_value(value) gist_trgm_ops
  )
  where ave and checked_data_type = 'string';
drop index triples_string_trgm_gist_idx;
alter index triples_string_trgm_gist_idx_no_e rename to triples_string_trgm_gist_idx;

create index if not exists triples_number_type_idx_no_e on triples (
    app_id,
    attr_id,
    triples_extract_number_value(value)
  )
  where ave and checked_data_type = 'number';
drop index triples_number_type_idx;
alter index triples_number_type_idx_no_e rename to triples_number_type_idx;

create index if not exists triples_boolean_type_idx_no_e on triples (
    app_id,
    attr_id,
    triples_extract_boolean_value(value)
  )
  where ave and checked_data_type = 'boolean';
drop index triples_boolean_type_idx;
alter index triples_boolean_type_idx_no_e rename to triples_boolean_type_idx;

create index if not exists triples_date_type_idx_no_e on triples (
    app_id,
    attr_id,
    triples_extract_date_value(value)
  )
  where ave and checked_data_type = 'date';
drop index triples_date_type_idx;
alter index triples_date_type_idx_no_e rename to triples_date_type_idx;

create index if not exists ave_index_no_e
  on triples(app_id, attr_id, value)
  where ave;
drop index ave_index;
alter index ave_index_no_e rename to ave_index;
