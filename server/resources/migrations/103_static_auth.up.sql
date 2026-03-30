create table app_test_users (
  id uuid primary key,
  app_id uuid not null references apps (id) on delete cascade,
  email text not null,
  code text not null,
  created_at timestamp with time zone not null default now(),
  unique (app_id, email)
);

create index on app_test_users (app_id);
