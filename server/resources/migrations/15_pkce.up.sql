alter table app_oauth_redirects add column code_challenge_method text;
alter table app_oauth_redirects add column code_challenge text;

alter table app_oauth_codes add column code_challenge_method text;
alter table app_oauth_codes add column code_challenge text;
