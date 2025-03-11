alter table
  apps
add
  column deletion_marked_at timestamp with time zone;

create index if not exists idx_apps_deletion_marked_at on apps (deletion_marked_at);
