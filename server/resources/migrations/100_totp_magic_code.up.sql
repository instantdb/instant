alter table apps add column totp_secret_key_enc bytea;
alter table apps add column totp_expiry_minutes integer;
