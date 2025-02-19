-- TODO: Add concurrently first
-- XXX: Try adding e back to the index?
-- XXX: What should we do with strings? We can't use the gist index to order them (gin also doesn't work)
--      1. could add a new btree index
--      2. could add a way for users to tell us that they want the string to be used for sorting
--         and add another ave-sorted field. Mostly you don't sort by strings, so this seems like a better approach?

create index if not exists triples_number_type_idx_nulls_first on triples (
    app_id,
    attr_id,
    triples_extract_number_value(value) nulls first
  )
  where ave and checked_data_type = 'number';
drop index triples_number_type_idx;
alter index triples_number_type_idx_nulls_first rename to triples_number_type_idx;

create index if not exists triples_boolean_type_idx_nulls_first on triples (
    app_id,
    attr_id,
    triples_extract_boolean_value(value) nulls first
  )
  where ave and checked_data_type = 'boolean';
drop index triples_boolean_type_idx;
alter index triples_boolean_type_idx_nulls_first rename to triples_boolean_type_idx;

create index if not exists triples_date_type_idx_nulls_first on triples (
    app_id,
    attr_id,
    triples_extract_date_value(value) nulls first
  )
  where ave and checked_data_type = 'date';
drop index triples_date_type_idx;
alter index triples_date_type_idx_nulls_first rename to triples_date_type_idx;
