alter table app_files_to_sweep add column process_id text;
create index app_files_to_sweep_process_id_idx on app_files_to_sweep (process_id);
create index app_files_to_sweep_created_at_idx ON app_files_to_sweep (created_at);
