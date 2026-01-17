alter table triples add column pg_size integer;
alter table attr_sketches add column triples_pg_size bigint;
