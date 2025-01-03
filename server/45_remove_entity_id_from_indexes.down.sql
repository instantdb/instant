alter index triples_string_trgm_gist_idx rename to triples_string_trgm_gist_no_e_idx;
create index triples_string_trgm_gist_idx on triples using gist (
    app_id,
    attr_id,
    triples_extract_string_value(value) gist_trgm_ops,
    entity_id
  )
  where ave and checked_data_type = 'string';
drop index triples_string_trgm_gist_no_e_idx;

alter index triples_number_type_idx rename to triples_number_type_no_e_idx;
create index triples_number_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_number_value(value),
    entity_id
  )
  where ave and checked_data_type = 'number';
drop index triples_number_type_no_e_idx;


alter index triples_boolean_type_idx rename to triples_boolean_type_no_e_idx;
create index triples_boolean_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_boolean_value(value),
    entity_id
  )
  where ave and checked_data_type = 'boolean';
drop index triples_boolean_type_no_e_idx;

alter index triples_date_type_idx rename to triples_date_type_no_e_idx;
create index triples_date_type_idx on triples (
    app_id,
    attr_id,
    triples_extract_date_value(value),
    entity_id
  )
  where ave and checked_data_type = 'date';
drop index triples_date_type_no_e_idx;

alter index ave_index rename to ave_no_e_idx;
create index ave_index
  on triples(app_id, attr_id, value, entity_id)
  where ave;
drop index ave_no_e_idx;