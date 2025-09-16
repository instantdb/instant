alter table apps add constraint requires_creator_or_org check (
  (creator_id is not null and org_id is null) or
  (org_id is not null and creator_id is null)
);
