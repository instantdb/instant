-- Run this concurrently first
create unique index if not exists eav_index on triples(app_id, entity_id, attr_id, value) where eav;

-- Run this concurrently first
create index if not exists vae_index on triples(app_id, value, attr_id, entity_id) where vae;
