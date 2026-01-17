alter table instant_stripe_customers drop constraint requires_user_or_org;

alter table instant_stripe_customers drop column org_id;
alter table instant_stripe_customers alter column user_id set not null;

alter table orgs drop column billing_email;
alter table orgs drop column subscription_id;

alter table instant_subscriptions drop constraint requires_app_or_org;

delete from instant_subscription_types where id = 3;
