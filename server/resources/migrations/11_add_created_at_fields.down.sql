alter table app_oauth_service_providers drop column created_at;
alter table app_oauth_clients drop column created_at;
alter table app_user_oauth_links drop column created_at;
alter table app_authorized_redirect_origins drop column created_at;
