-- A provider is something that generates unique ids for a user in their system
-- Google is a provider that you might have multiple OAuth clients for, but
-- they would all return the same id.
create table app_oauth_service_providers (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  provider_name text not null,
  unique(app_id, provider_name)
);

create index on app_oauth_service_providers(app_id);

create table app_oauth_clients (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,

  -- provider is deliberately not unique because you could have multiple
  -- services for the same provider. The unique thing the providers all
  -- share is the sub
  provider_id uuid not null references app_oauth_service_providers(id) on delete cascade,

  -- client_name allows the user to have a easy to use name to indicate that
  -- they want to log in with this client, e.g. google-web and google-native
  client_name text not null,

  client_id text not null,
  client_secret bytea not null,
  authorization_endpoint text not null,
  token_endpoint text not null,
  unique (app_id, provider_id, client_name)
);

create index on app_oauth_clients(provider_id);

create table app_oauth_redirects (
  -- sha256 of the state to prevent timing attacks
  lookup_key bytea primary key,
  state uuid not null,
  cookie uuid not null,
  redirect_url text not null,
  client_id uuid not null references app_oauth_clients(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index on app_oauth_redirects(client_id);

create table app_oauth_codes (
  -- sha256 of the code to prevent timing attacks
  lookup_key bytea primary key,
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index on app_oauth_codes (user_id);
create index on app_oauth_codes (app_id);

create table app_user_oauth_links (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  sub text not null,
  provider_id uuid not null references app_oauth_service_providers(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  -- ensures oauth login is not shared across multiple users for the same app
  unique (app_id, sub, provider_id)
);

create index on app_user_oauth_links(provider_id);
create index on app_user_oauth_links(user_id);

create table app_authorized_redirect_origins (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  service text not null,
  params text[] not null,
  unique (app_id, service, params)
);
