create table config (
  k text primary key not null,
  v json not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_updated_at_trigger
before update on config
for each row
execute function update_updated_at_column();
