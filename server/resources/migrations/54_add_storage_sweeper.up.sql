alter table app_files_to_sweep add column process_id text;
alter table app_files_to_sweep add column updated_at timestamp;
create index app_files_to_sweep_process_id_updated_at_idx on app_files_to_sweep (process_id, updated_at);
create index app_files_to_sweep_created_at_idx ON app_files_to_sweep (created_at);
