alter table apps add column subscription_id uuid references instant_subscriptions (id) on delete set null;
create index on apps (subscription_id);

-- Migration to set the subscription_id on the apps
with subscriptions as (
  select distinct on (app_id) *
    from instant_subscriptions
  order by app_id, created_at desc
)
update apps
   set subscription_id = s.id
  from subscriptions as s
  where s.app_id = apps.id;
