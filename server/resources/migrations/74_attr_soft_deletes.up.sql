alter table
  attrs
add
  column deletion_marked_at timestamp with time zone;

create index if not exists idx_attrs_deletion_marked_at on attrs (deletion_marked_at);

