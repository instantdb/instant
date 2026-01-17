create or replace function org_members_after_update_trigger()
returns trigger as $$
declare
  org_id uuid;
  owner_member_id uuid;
begin
  -- prevent removing the last owner
  if old.role <> 'owner' or new.role = 'owner' then
    return new;
  end if;

  if old.org_id <> new.org_id then
    raise exception 'modify_org_id_on_org_member';
  end if;

  select orgs.id into org_id
    from orgs
   where orgs.id = new.org_id;

  -- Skip the check if the org was deleted.
  if org_id is null then
    return new;
  end if;

  select m.id into owner_member_id
    from org_members m
   where m.org_id = new.org_id
     and m.role = 'owner'
   limit 1;

  if owner_member_id is null then
    raise exception 'remove_last_org_owner';
  end if;

  return new;

end;
$$ language plpgsql;

create or replace function org_members_after_delete_trigger()
returns trigger as $$
declare
  org_id uuid;
  owner_member_id uuid;
begin
  -- prevent removing the last owner

  if old.role <> 'owner' then
    return old;
  end if;

  select orgs.id into org_id
    from orgs
   where orgs.id = old.org_id;

  -- Skip the check if the org was deleted.
  if org_id is null then
    return old;
  end if;

  select m.id into owner_member_id
    from org_members m
   where m.org_id = old.org_id
     and m.role = 'owner'
   limit 1;

  if owner_member_id is null then
    raise exception 'remove_last_org_owner';
  end if;

  return old;

end;
$$ language plpgsql;

create or replace trigger org_members_after_update_trigger
  after update on org_members
  for each row
  execute function org_members_after_update_trigger();

create or replace trigger org_members_after_delete_trigger
  after delete on org_members
  for each row
  execute function org_members_after_delete_trigger();
