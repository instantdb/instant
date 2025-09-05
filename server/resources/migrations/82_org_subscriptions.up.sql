alter table instant_stripe_customers alter column user_id drop not null;
alter table instant_stripe_customers add column org_id uuid references orgs (id);
create unique index on instant_stripe_customers (org_id);

alter table instant_stripe_customers add constraint requires_user_or_org check (
  (user_id is not null and org_id is null) or
  (org_id is not null and user_id is null)
);

alter table orgs add column billing_email text;
alter table orgs add column subscription_id uuid references instant_subscriptions (id);

alter table instant_subscriptions add constraint requires_app_or_org check (
  (app_id is not null and org_id is null) or
  (org_id is not null and app_id is null)
);

insert into instant_subscription_types (id, name) values (3, 'Startup');
