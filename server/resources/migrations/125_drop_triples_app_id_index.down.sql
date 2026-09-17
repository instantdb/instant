-- Run in prod first `create index concurrently triples_app_id on triples(app_id);`
create index if not exists triples_app_id on triples(app_id);
