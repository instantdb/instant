-- no down migration for adding back deprecated triples

alter table instant_subscriptions drop column id;
