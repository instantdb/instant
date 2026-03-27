drop trigger if exists rule_versions_trigger on rules;
drop function if exists rule_versions_trigger_fn();
drop table if exists rule_versions;
alter table rules drop column if exists version;
