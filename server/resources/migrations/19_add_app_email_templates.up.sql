create table app_email_senders (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete set null,
  postmark_id integer not null,
  email text not null,
  name text not null,

  unique (email)
);

create table app_email_templates (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  email_type text not null,
  sender_id uuid references app_email_senders(id) on delete set null,
  body text not null,
  subject text not null,
  
  unique (app_id, email_type)
);