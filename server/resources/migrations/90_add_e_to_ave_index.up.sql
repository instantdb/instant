-- Create concurrently in production
--  create index concurrently ave_index_with_e on triples(app_id, attr_id, value, entity_id) where ave;
create index if not exists ave_index_with_e on triples(app_id, attr_id, value, entity_id) where ave;
