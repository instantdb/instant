-- Run this concurrently first
create unique index eav_index on triples(app_id, entity_id, attr_id, value) where eav;

-- Run this concurrently first
create index vae_index on triples(app_id, value, attr_id, entity_id) where vae;
