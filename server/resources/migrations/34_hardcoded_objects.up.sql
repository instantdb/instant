insert into instant_users (id, email)
  values ('e1111111-1111-1111-1111-111111111ca7'::uuid, 'system-catalog-user@instantdb.com');

insert into apps (id, creator_id, title)
  values (
    'a1111111-1111-1111-1111-111111111ca7',
    'e1111111-1111-1111-1111-111111111ca7',
    'System catalog'
  );

create or replace function prevent_delete_system_catalog_user()
returns trigger as $$
begin
  if old.id = 'e1111111-1111-1111-1111-111111111ca7' then
    raise exception 'Deleting the system catalog user is not allowed.';
  end if;
  return old;
end;
$$
language plpgsql;

create trigger prevent_delete_system_catalog_user_trigger
  before delete on instant_users
  for each row
  execute function prevent_delete_system_catalog_user();

create or replace function prevent_delete_system_catalog_app()
returns trigger as $$
begin
  if old.id = 'a1111111-1111-1111-1111-111111111ca7' then
    raise exception 'Deleting the system catalog app is not allowed.';
  end if;
  return old;
end;
$$
language plpgsql;

create trigger prevent_delete_system_catalog_app_trigger
  before delete on apps
  for each row
  execute function prevent_delete_system_catalog_app();

create or replace function prevent_delete_system_catalog_attr()
returns trigger as $$
declare
  disable_trigger boolean := false;
begin

  begin
    disable_trigger := current_setting('instant.allow_system_catalog_app_attr_delete')::boolean;
  exception when undefined_object then
    disable_trigger := false;
  end;

  if disable_trigger then
    return old;
  end if;

  if old.app_id = 'a1111111-1111-1111-1111-111111111ca7' then
    raise exception 'Deleting attrs on the system catalog app is not allowed. Set the `instant.allow_system_catalog_app_attr_delete` setting to true to override.';
  end if;
  return old;
end;
$$
language plpgsql;

create trigger prevent_delete_system_catalog_attr_trigger
  before delete on attrs
  for each row
  execute function prevent_delete_system_catalog_attr();

create or replace function prevent_delete_system_catalog_ident()
returns trigger as $$
declare
  disable_trigger boolean := false;
begin

  begin
    disable_trigger := current_setting('instant.allow_system_catalog_app_ident_delete')::boolean;
  exception when undefined_object then
    disable_trigger := false;
  end;

  if disable_trigger then
    return old;
  end if;

  if old.app_id = 'a1111111-1111-1111-1111-111111111ca7' then
    raise exception 'Deleting idents on the system catalog app is not allowed. Set the `instant.allow_system_catalog_app_ident_delete` setting to true to override.';
  end if;
  return old;
end;
$$
language plpgsql;

create trigger prevent_delete_system_catalog_ident_trigger
  before delete on idents
  for each row
  execute function prevent_delete_system_catalog_ident();
