drop index app_files_to_sweep_created_at_idx;
drop index app_files_to_sweep_process_id_idx;
alter table app_files_to_sweep drop column process_id;
