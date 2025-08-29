-- XXX
-- drop trigger insert_files_to_sweep_trigger on triples;
-- drop trigger update_files_to_sweep_trigger on triples;

-- drop function create_file_to_sweep();
-- drop function create_file_to_sweep_on_update();

drop trigger triples_batched_after_insert on triples;
drop trigger triples_batched_after_update on triples;
drop trigger triples_batched_after_delete on triples;

drop function triples_delete_batch_trigger;
drop function triples_insert_batch_trigger;
drop function triples_update_batch_trigger;

alter table triples drop column pg_size;
alter table attr_sketches drop column triples_pg_size;
