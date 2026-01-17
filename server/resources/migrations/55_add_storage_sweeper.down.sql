drop index app_files_to_sweep_created_at_idx;
drop index app_files_to_sweep_process_id_updated_at_idx;

drop trigger update_updated_at_trigger on app_files_to_sweep;

alter table app_files_to_sweep drop column process_id;
alter table app_files_to_sweep drop column updated_at;
alter table app_files_to_sweep alter column created_at type timestamp without time zone;
