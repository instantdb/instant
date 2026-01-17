DROP TRIGGER insert_files_to_sweep_trigger ON triples;
DROP TRIGGER update_files_to_sweep_trigger ON triples;

DROP FUNCTION create_file_to_sweep();
DROP FUNCTION create_file_to_sweep_on_update();

DROP TABLE app_files_to_sweep;
