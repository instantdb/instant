alter table app_email_senders add column app_id uuid references apps(id) on delete set null 
