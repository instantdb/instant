create table org_member_invites (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  inviter_id uuid not null references instant_users(id) on delete cascade,
  invitee_role text not null,
  invitee_email text not null,
  status text not null,
  created_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone default now(),
  unique (org_id, invitee_email)
);

create index on org_member_invites (inviter_id);
