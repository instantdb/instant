alter table instant_subscriptions alter column app_id set not null;
alter table instant_subscriptions alter column user_id set not null;
alter table instant_subscriptions drop column org_id;

alter table apps alter column creator_id set not null;
alter table apps drop column org_id;

drop table org_members;
drop table orgs;
