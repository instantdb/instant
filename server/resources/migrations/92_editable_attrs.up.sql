create or replace function prevent_required_on_reserved_attrs()
returns trigger as $$
begin
  if new.is_required
     and starts_with(new.etype, '$')
     and new.app_id <> 'a1111111-1111-1111-1111-111111111ca7'
  then
    raise exception 'required_set_on_reserved_attrs';
  end if;
  
  return new;
end;
$$ language plpgsql;

create trigger prevent_required_on_reserved_attrs_trigger
  before insert or update on attrs
  for each row
  execute function prevent_required_on_reserved_attrs();

create or replace function prevent_update_system_catalog_attr()
returns trigger as $$
declare
  disable_trigger boolean := false;
begin
  -- Check if override setting is enabled
  begin
    disable_trigger := current_setting('instant.allow_system_catalog_app_attr_update')::boolean;
  exception when undefined_object then
    disable_trigger := false;
  end;

  if disable_trigger then
    return new;
  end if;

  -- Prevent updates for system catalog app
  if old.app_id = 'a1111111-1111-1111-1111-111111111ca7' or new.app_id = 'a1111111-1111-1111-1111-111111111ca7' then
    raise exception 'Updating attrs on the system catalog app is not allowed. Set the `instant.allow_system_catalog_app_attr_update` setting to true to override.';
  end if;

  return new;
end;
$$
language plpgsql;

create trigger prevent_update_system_catalog_attr_trigger
  before update on attrs
  for each row
  execute function prevent_update_system_catalog_attr();

create or replace function prevent_update_system_catalog_ident()
returns trigger as $$
declare
  disable_trigger boolean := false;
begin
  if old.app_id = 'a1111111-1111-1111-1111-111111111ca7' or new.app_id = 'a1111111-1111-1111-1111-111111111ca7' then
    -- Check if override setting is enabled
    begin
      disable_trigger := current_setting('instant.allow_system_catalog_app_ident_update')::boolean;
    exception when undefined_object then
      disable_trigger := false;
    end;

    if disable_trigger then
      return new;
    end if;
    raise exception 'Updating idents on the system catalog app is not allowed. Set the `instant.allow_system_catalog_app_ident_update` setting to true to override.';
  end if;

  return new;
end;
$$
language plpgsql;

create trigger prevent_update_system_catalog_ident_trigger
  before update on idents
  for each row
  execute function prevent_update_system_catalog_ident();
