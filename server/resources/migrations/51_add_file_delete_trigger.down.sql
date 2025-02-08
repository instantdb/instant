DROP TRIGGER insert_files_to_sweep_trigger ON triples;
DROP TRIGGER delete_files_to_sweep_trigger ON triples;

DROP FUNCTION create_file_to_sweep();
DROP FUNCTION delete_file_to_sweep();

DROP TABLE app_files_to_sweep;
