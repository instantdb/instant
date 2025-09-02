create table orgs (
  id uuid primary key,
  title text not null check (length(title) <= 140),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create trigger update_updated_at_trigger
before update on orgs
for each row
execute function update_updated_at_column();

create table org_members (
  id uuid primary key,
  org_id uuid not null references orgs (id) on delete cascade,
  user_id uuid not null references instant_users (id) on delete cascade,
  -- multiple roles??
  -- maybe we want capabilities instead?
  role text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (org_id, user_id)
);

-- Unique constraint adds index on org_id for cascade delete
-- Create index on user_id for cascade delete
create index on org_members (user_id);

create trigger update_updated_at_trigger
before update on org_members
for each row
execute function update_updated_at_column();

-- XXX: How should we handle org deletion?
alter table apps add column org_id uuid references orgs (id);
create index on apps (org_id);

alter table apps alter column creator_id drop not null;

alter table instant_subscriptions add column org_id uuid references orgs (id);
create index on instant_subscriptions (org_id);

alter table instant_subscriptions alter column user_id drop not null;
alter table instant_subscriptions alter column app_id drop not null;
