alter table app_oauth_service_providers add column created_at timestamp with time zone not null default now();
alter table app_oauth_clients add column created_at timestamp with time zone not null default now();
alter table app_user_oauth_links add column created_at timestamp with time zone not null default now();
alter table app_authorized_redirect_origins add column created_at timestamp with time zone not null default now();
