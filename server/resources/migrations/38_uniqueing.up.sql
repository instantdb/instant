alter table attrs add column setting_unique boolean;

alter table indexing_jobs add column invalid_unique_value jsonb;
alter table indexing_jobs add column invalid_entity_id uuid;
alter table indexing_jobs add column error_detail text;
