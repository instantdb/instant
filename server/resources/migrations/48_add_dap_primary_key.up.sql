alter table daily_app_transactions add column id uuid primary key default gen_random_uuid();
