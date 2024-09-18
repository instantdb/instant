create table instant_personal_access_tokens (
  id uuid primary key,
  created_at timestamp not null default now(),
  name text not null,
  user_id uuid not null references instant_users(id) on delete cascade
);

create index instant_personal_access_tokens_user_id_index
  on instant_personal_access_tokens (user_id);
