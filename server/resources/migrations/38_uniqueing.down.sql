alter table attrs drop column setting_unique;

alter table indexing_jobs drop column invalid_unique_value;
alter table indexing_jobs drop column invalid_entity_id;
alter table indexing_jobs drop column error_detail;
