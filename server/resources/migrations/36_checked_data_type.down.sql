drop table indexing_jobs;
drop type indexing_job_status;
alter table triples drop constraint valid_value_data_type;

drop function triples_valid_value;
drop function is_jsonb_valid_datestring;
drop function is_jsonb_valid_timestamp;
drop function triples_extract_date_value;
drop function triples_extract_boolean_value;
drop function triples_extract_number_value;
drop function triples_extract_string_value;


alter table triples drop column checked_data_type;

alter table attrs drop column indexing;
alter table attrs drop column checking_data_type;
alter table attrs drop column checked_data_type;

drop type checked_data_type;
