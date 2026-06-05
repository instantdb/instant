drop trigger triples_before_insert_size on triples;
drop function triples_before_insert_size();

create trigger triples_batched_after_insert
  after insert on triples
  referencing new table as newrows
  for each statement
  execute function triples_insert_batch_trigger();
