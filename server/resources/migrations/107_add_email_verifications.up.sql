CREATE TABLE app_email_verifications (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  sender_id uuid not null references app_email_senders(id) on delete cascade,
  verified boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  UNIQUE(app_id, sender_id)
);

create trigger update_updated_at_trigger
before update on app_email_verifications
for each row
execute function update_updated_at_column();
