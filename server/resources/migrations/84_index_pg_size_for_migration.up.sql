-- Run `create index concurrently if not exists triples_pg_size_idx on triples (pg_size) where pg_size is null;` in production
-- before running migration
-- Temporary index while we populate all of the pg_size columns on triples
create index if not exists triples_pg_size_idx on triples (pg_size) where pg_size is null;
