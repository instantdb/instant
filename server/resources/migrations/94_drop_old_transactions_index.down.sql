-- In prod, run `create index concurrently transactions_app_id_idx on transactions(app_id);` first
create index if not exists transactions_app_id_idx on transactions(app_id);
