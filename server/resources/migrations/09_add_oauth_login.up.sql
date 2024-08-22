alter table instant_users add column google_sub text unique;

create table instant_oauth_redirects (
  -- sha256 of the state to prevent timing attacks
  lookup_key bytea primary key,
  state uuid not null,
  cookie uuid not null,
  service text not null,
  redirect_path text not null,
  created_at timestamp with time zone not null default now()
);

create table instant_oauth_codes (
  -- sha256 of the code to prevent timing attacks
  lookup_key bytea primary key,
  redirect_path text not null,
  user_id uuid not null references instant_users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

-- Index so we don't have to do a full scan when a user is deleted
create index on instant_oauth_codes (user_id);
