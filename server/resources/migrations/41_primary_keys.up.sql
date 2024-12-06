drop table if exists deprecated_triples;

alter table instant_subscriptions add column id uuid primary key default gen_random_uuid();
