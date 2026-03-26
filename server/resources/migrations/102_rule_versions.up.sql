alter table rules add column version integer not null default 0;

create table rule_versions (
  app_id uuid not null references apps (id) on delete cascade,
  version integer not null,
  edits jsonb not null,
  created_at timestamp with time zone not null default now(),
  primary key (app_id, version)
);

create or replace function rule_versions_trigger_fn()
returns trigger
language plpgsql as $$
begin
  if OLD.version is distinct from NEW.version then
    insert into rule_versions (app_id, version, edits)
    values (NEW.app_id, NEW.version, generate_editscript_edits(NEW.code, OLD.code));
  end if;
  return NEW;
end;
$$;

create trigger rule_versions_trigger
  after update on rules
  for each row
  execute function rule_versions_trigger_fn();
