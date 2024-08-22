create table app_members (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references instant_users(id) on delete cascade,
  member_role text not null,
  created_at timestamp with time zone not null default now(),
  
  unique (app_id, user_id)
);

create table app_member_invites (
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  inviter_id uuid not null references instant_users(id) on delete cascade,
  invitee_role text not null,
  invitee_email text not null,
  status text not null,
  created_at timestamp with time zone not null default now(),

  unique (app_id, invitee_email)
);
