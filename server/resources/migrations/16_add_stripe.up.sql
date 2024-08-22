create table instant_stripe_customers (
  id text primary key not null,
  user_id uuid not null references instant_users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

alter table instant_stripe_customers add constraint unique_user_id unique (user_id);

create index on instant_stripe_customers (user_id);

create table instant_subscription_types (
  id smallint primary key not null,
  name text not null,
  created_at timestamp with time zone not null default now()
);

INSERT INTO instant_subscription_types (id, name) VALUES (1, 'Free');
INSERT INTO instant_subscription_types (id, name) VALUES (2, 'Pro');

create table instant_subscriptions (
  user_id uuid not null references instant_users(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  subscription_type_id smallint not null references instant_subscription_types(id),
  stripe_customer_id text not null references instant_stripe_customers(id) on delete cascade,
  stripe_subscription_id text,
  -- Guard against duplicate stripe events
  stripe_event_id text not null unique,
  created_at timestamp with time zone not null default now()
);

create index on instant_subscriptions (stripe_event_id);
create index on instant_subscriptions (user_id);
create index on instant_subscriptions (app_id, user_id);
