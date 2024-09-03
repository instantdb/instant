alter table app_oauth_clients alter column client_id set not null;
alter table app_oauth_clients alter column client_secret set not null;
alter table app_oauth_clients alter column authorization_endpoint set not null;
alter table app_oauth_clients alter column token_endpoint set not null;
alter table app_oauth_clients drop column meta;

alter table app_oauth_clients drop constraint unique_client_name_per_app;
