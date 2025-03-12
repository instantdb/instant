create table instant_oauth_app_clients (
  client_id uuid primary key,
  -- Don't let someone delete their app without deciding
  -- what happens to the OAuth clients they created
  -- It would be nice to attach these to an org, but we don't have that concept
  app_id uuid not null references apps (id) on delete restrict,
  hashed_client_secret bytea not null,
  client_name text unique not null,
  javascript_origins text[] not null,
  authorized_redirect_urls text[] not null,
  granted_scopes text[] not null,
  is_public boolean not null,
  support_email text,
  app_home_page text,
  app_privacy_policy_link text,
  app_tos_link text,
  app_logo bytea,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_clients (app_id);

create trigger update_updated_at_trigger
  before update on instant_oauth_app_clients for each row
  execute function update_updated_at_column();

create table instant_oauth_app_codes (
  lookup_key bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  redirect_url text not null,
  user_id uuid not null references instant_users (id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_codes (client_id);
create index on instant_oauth_app_codes (user_id);

create table instant_oauth_app_redirects (
  lookup_key bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  state uuid not null,
  cookie uuid not null,
  redirect_url text not null,
  code_challenge_method text,
  code_challenge text,
  created_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_redirects (client_id);

create table instant_user_oauth_refresh_tokens (
  lookup_key bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  user_id uuid not null references instant_users (id) on delete cascade,
  scopes text[] not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_user_oauth_refresh_tokens (client_id);
create index on instant_user_oauth_refresh_tokens (user_id);

create table instant_user_oauth_tokens (
  lookup_key bytea primary key,
  refresh_token_lookup_key bytea references instant_user_oauth_refresh_tokens (lookup_key) on delete cascade,
  user_id uuid not null references instant_users (id) on delete cascade,
  scopes text[] not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_user_oauth_tokens (refresh_token_lookup_key);
