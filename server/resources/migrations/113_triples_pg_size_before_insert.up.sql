-- `triples.pg_size` (the on-disk byte size of a triple, used for storage
-- accounting) was populated by an AFTER INSERT statement-level trigger
-- (`triples_batched_after_insert` -> `triples_insert_batch_trigger`) that
-- issued a second UPDATE over every freshly-inserted row:
--
--   update triples t set pg_size = triples_column_size(t) from newrows n ...
--
-- So every triple INSERT was immediately followed by an UPDATE of the same
-- row. On the hot triples path that means a redundant tuple version + WAL for
-- every insert (n_tup_upd ~= n_tup_ins), for every app.
--
-- Populate pg_size inline with a BEFORE INSERT row trigger instead, so the row
-- is written once with pg_size already set. No second write.
--
-- NOTE: `triples_column_size(new)` is computed on the NEW record (pre-write).
-- Verified on PG 16.6 that this yields identical pg_size values to the old
-- AFTER-INSERT path for normal (non-TOASTed) triples. Spot-check large/TOASTed
-- values on the production Postgres version before merging, since pg_column_size
-- can in theory differ between the in-memory and stored tuple on PG < 17.

create or replace function triples_before_insert_size()
returns trigger as $$
begin
  new.pg_size := public.triples_column_size(new);
  return new;
end;
$$ language plpgsql;

drop trigger triples_batched_after_insert on triples;

create trigger triples_before_insert_size
  before insert on triples
  for each row
  execute function triples_before_insert_size();
