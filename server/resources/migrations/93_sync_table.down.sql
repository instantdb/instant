drop function if exists unnest_2d(anyarray);

drop table if exists sync_sub_topics;

drop type if exists topics_idx;

drop table if exists sync_subs;

-- Run `drop index concurrently transactions_app_id_id_idx` in prod first
drop index if exists transactions_app_id_id_idx;
