-- Create concurrently in production
--  create index concurrently ave_with_e_index on triples(app_id, attr_id, value, entity_id) where ave;
create index if not exists ave_with_e_index on triples(app_id, attr_id, value, entity_id) where ave;
