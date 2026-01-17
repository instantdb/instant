-- Run in prod first `create index concurrently ave_index on triples(app_id, attr_id, value) where ave;`
create index if not exists ave_index on triples(app_id, attr_id, value) where ave;
