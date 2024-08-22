alter table app_oauth_redirects drop column code_challenge_method;
alter table app_oauth_redirects drop column code_challenge;

alter table app_oauth_codes drop column code_challenge_method;
alter table app_oauth_codes drop column code_challenge;
