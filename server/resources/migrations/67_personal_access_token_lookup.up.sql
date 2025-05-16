alter table instant_personal_access_tokens add column lookup_key bytea;

update instant_personal_access_tokens set lookup_key = sha256(cast(cast(id as text) as bytea));

alter table instant_personal_access_tokens alter column lookup_key set not null;

create index on instant_personal_access_tokens (lookup_key);
