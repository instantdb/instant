-- Run `create index concurrently if not exists triples_pg_size_idx on triples (pg_size) where pg_size is null;` in production
-- before running migration
create index if not exists triples_pg_size_idx on triples (pg_size) where pg_size is null;
