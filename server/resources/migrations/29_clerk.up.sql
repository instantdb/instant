alter table app_oauth_clients alter column client_id drop not null;
alter table app_oauth_clients alter column client_secret drop not null;
alter table app_oauth_clients alter column authorization_endpoint drop not null;
alter table app_oauth_clients alter column token_endpoint drop not null;
alter table app_oauth_clients add column meta jsonb;

-- Needs to be unique per app--currently only unique per provider
alter table app_oauth_clients add constraint unique_client_name_per_app unique (app_id, client_name);
