create or replace function prevent_required_on_reserved_attrs()
returns trigger as $$
begin
  if new.is_required
    and starts_with(new.etype, '$')
    and new.app_id <> 'a1111111-1111-1111-1111-111111111ca7' then
        raise exception 'required_set_on_reserved_attrs';
    end if;
    return new;
end;
$$ language plpgsql;

create trigger prevent_required_on_reserved_attrs_trigger
  before insert or update on attrs
  for each row
  execute function prevent_required_on_reserved_attrs();
