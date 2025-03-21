create table instant_oauth_apps (
  id uuid primary key,
  app_id uuid not null references apps (id) on delete restrict,
  app_name text not null,
  granted_scopes text[] not null,
  is_public boolean not null,
  support_email text,
  app_home_page text,
  app_privacy_policy_link text,
  app_tos_link text,
  app_logo bytea,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (app_id, app_name)
);

create index on instant_oauth_apps (app_id);

create trigger update_updated_at_trigger
  before update on instant_oauth_apps for each row
  execute function update_updated_at_column();

create table instant_oauth_app_clients (
  client_id uuid primary key,
  -- Don't let someone delete their app without deciding
  -- what happens to the OAuth clients they created
  -- It would be nice to attach these to an org, but we don't have that concept
  oauth_app_id uuid not null references instant_oauth_apps (id) on delete cascade,
  client_name text not null,
  authorized_redirect_urls text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (oauth_app_id, client_name)
);

create index on instant_oauth_app_clients (oauth_app_id);

create trigger update_updated_at_trigger
  before update on instant_oauth_app_clients for each row
  execute function update_updated_at_column();

create table instant_oauth_app_client_secrets (
  id uuid primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  hashed_secret bytea not null,
  -- used to identify the secret
  first_four text not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_client_secrets (client_id);

create type instant_oauth_app_redirect_status as enum (
  'init',
  'claimed',
  'granted'
);

create table instant_oauth_app_redirects (
  lookup_key bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  state text not null,
  cookie uuid not null,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge_method text,
  code_challenge text,
  status instant_oauth_app_redirect_status not null,
  user_id uuid references instant_users (id) on delete cascade,
  grant_token uuid,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_redirects (client_id);
create index on instant_oauth_app_redirects (user_id);
create index on instant_oauth_app_redirects (expires_at);

create table instant_oauth_app_codes (
  hashed_code bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  redirect_uri text not null,
  user_id uuid not null references instant_users (id) on delete cascade,
  scopes text[] not null,
  code_challenge_method text,
  code_challenge text,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_oauth_app_codes (client_id);
create index on instant_oauth_app_codes (user_id);
create index on instant_oauth_app_codes (expires_at);

create table instant_user_oauth_refresh_tokens (
  lookup_key bytea primary key,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  user_id uuid not null references instant_users (id) on delete cascade,
  scopes text[] not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_user_oauth_refresh_tokens (client_id);
create index on instant_user_oauth_refresh_tokens (user_id);

create table instant_user_oauth_access_tokens (
  lookup_key bytea primary key,
  refresh_token_lookup_key bytea references instant_user_oauth_refresh_tokens (lookup_key) on delete cascade,
  client_id uuid not null references instant_oauth_app_clients (client_id) on delete cascade,
  user_id uuid not null references instant_users (id) on delete cascade,
  scopes text[] not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create index on instant_user_oauth_access_tokens (refresh_token_lookup_key);
create index on instant_user_oauth_access_tokens (client_id);
create index on instant_user_oauth_access_tokens (user_id);
create index on instant_user_oauth_access_tokens (expires_at);
