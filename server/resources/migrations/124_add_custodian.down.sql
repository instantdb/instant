drop table custodian;

-- Recreate the trigger that cleans up triples_size_updates on attr delete.
create or replace function clean_triples_size_updates()
returns trigger as $$
begin
  delete from triples_size_updates where triples_size_updates.attr_id = old.id;
  return old;
end;
$$ language plpgsql;

create trigger clean_triples_size_updates_trigger
before delete on attrs
for each row
execute function clean_triples_size_updates();
