create table rate_limit_keys (
  key uuid primary key,
  value bytea not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index on rate_limit_keys(updated_at);

create trigger update_updated_at_trigger
before update on rate_limit_keys
for each row
execute function update_updated_at_column();
