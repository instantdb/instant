alter table app_files_to_sweep alter column created_at type timestamp with time zone 
  using created_at at time ZONE 'UTC';
alter table app_files_to_sweep add column updated_at timestamp with time zone not null default now();;
alter table app_files_to_sweep add column process_id text;

create trigger update_updated_at_trigger
  before update on app_files_to_sweep for each row
  execute function update_updated_at_column();

create index app_files_to_sweep_process_id_updated_at_idx on app_files_to_sweep (process_id, updated_at);
create index app_files_to_sweep_created_at_idx ON app_files_to_sweep (created_at);
