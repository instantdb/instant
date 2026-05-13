create type webhook_action as enum ('create', 'update', 'delete');
create type webhook_status as enum ('active', 'disabled');

create table webhooks(
  id uuid primary key,
  app_id uuid not null references apps (id) on delete cascade,
  -- Acts as a bloom filter for the `a` topic fields
  topics bigint not null,
  -- Right now you can only do create/update/delete webhooks so this works well
  -- for identifying the entity, but we might want to support regular queries
  -- in the future (that's why this is nullable)
  id_attr_ids uuid[],
  actions webhook_action[] not null,
  status webhook_status not null default 'active',
  disabled_reason text,
  -- Will just be {"url": "some-url"} for now, but could be something else later
  sink jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create trigger update_updated_at_trigger
before update on webhooks
for each row
execute function update_updated_at_column();

create index on webhooks (app_id, status);

create type webhook_event_status as enum ('pending', 'processing', 'success', 'error', 'failed');
create type webhook_attempt as (
  attempt_at timestamp with time zone,
  duration_ms int,
  success boolean,
  status_code int,
  response_text text,
  error_type text,
  error_message text
);

create table webhook_events(
  -- We intentionally leave off the foreign key constraint so that deletes
  -- only happen through truncate
  webhook_id uuid not null,
  isn isn not null,
  -- We intentionally leave off the foreign key constraint so that deletes
  -- only happen through truncate
  app_id uuid not null,
  status webhook_event_status not null,
  machine_id uuid,
  -- Tracks metadata about each attempt
  attempts webhook_attempt[],
  -- Each bucket spans 30 days. 13 buckets cycle every 390 days, giving ≥360
  -- days of retention. Truncate the next-to-be-reused bucket before writes
  -- wrap around.
  partition_bucket int not null,
  next_attempt_after timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (webhook_id, isn, partition_bucket)
) partition by range (partition_bucket);

create table webhook_events_0 partition of webhook_events for values from (0) to (1);
create table webhook_events_1 partition of webhook_events for values from (1) to (2);
create table webhook_events_2 partition of webhook_events for values from (2) to (3);
create table webhook_events_3 partition of webhook_events for values from (3) to (4);
create table webhook_events_4 partition of webhook_events for values from (4) to (5);
create table webhook_events_5 partition of webhook_events for values from (5) to (6);
create table webhook_events_6 partition of webhook_events for values from (6) to (7);
create table webhook_events_7 partition of webhook_events for values from (7) to (8);
create table webhook_events_8 partition of webhook_events for values from (8) to (9);
create table webhook_events_9 partition of webhook_events for values from (9) to (10);
create table webhook_events_10 partition of webhook_events for values from (10) to (11);
create table webhook_events_11 partition of webhook_events for values from (11) to (12);
create table webhook_events_12 partition of webhook_events for values from (12) to (13);

create trigger update_updated_at_trigger
before update on webhook_events
for each row
execute function update_updated_at_column();

-- Acts in place of the foreign keys we deliberately omitted on
-- webhook_events.webhook_id and webhook_events.app_id: rejects inserts whose
-- (webhook_id, app_id) pair doesn't match an existing webhook. Skipping the
-- FKs lets us reclaim space via partition truncate without cascade work.
create or replace function check_webhook_events_refs() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from webhooks
    where id = new.webhook_id
      and app_id = new.app_id
  ) then
    raise exception 'webhook_events: no webhook with id=% for app_id=%',
      new.webhook_id, new.app_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger check_refs_insert_trigger
before insert on webhook_events
for each row
execute function check_webhook_events_refs();

create index on webhook_events (app_id, webhook_id, created_at desc);
create index on webhook_events (partition_bucket, created_at, status) where status = 'pending';
create index on webhook_events (partition_bucket, app_id, created_at, status) where status = 'pending';
create index on webhook_events (updated_at, status) where status = 'processing';
create index on webhook_events (next_attempt_after, partition_bucket, status) where status = 'error';


-- Claims pending webhook_events, claiming up to 10 per app for up to 10 apps
-- (configurable with optional 2nd and 3rd arguments).
-- Uses SKIP LOCKED so concurrent workers don't collide.
-- Updates status to 'processing' and records machine_id.
-- Restricts the scan to the current and previous partition_bucket.
create or replace function claim_webhook_events(
  p_machine_id uuid,
  p_max_apps int default 10,
  p_max_per_app int default 10
)
returns setof webhook_events
language plpgsql as $$
declare
  r webhook_events;
  picked_app uuid;
  seen uuid[] := array[]::uuid[];
  current_bucket int := ((extract(epoch from now())::bigint / 86400 / 30) % 13)::int;
  buckets int[] := array[current_bucket, (current_bucket + 12) % 13];
begin
  for i in 1..p_max_apps loop
    picked_app := null;
    for r in
      with next_app as (
        select app_id from webhook_events
        where status = 'pending'
          and partition_bucket = any(buckets)
          and app_id <> all(seen)
        order by created_at
        limit 1
        for update skip locked
      ),
      locked as (
        select p.ctid, p.tableoid, p.partition_bucket from next_app n
        cross join lateral (
          select ctid, tableoid, partition_bucket from webhook_events
          where app_id = n.app_id
            and partition_bucket = any(buckets)
            and status = 'pending'
          order by created_at
          limit p_max_per_app
          for update skip locked
        ) p
      )
      update webhook_events
      set status = 'processing',
          machine_id = p_machine_id
      from locked
      where webhook_events.ctid = locked.ctid
        and webhook_events.tableoid = locked.tableoid
        and webhook_events.partition_bucket = locked.partition_bucket
      returning webhook_events.*
    loop
      return next r;
      picked_app := r.app_id;
    end loop;

    exit when picked_app is null;
    seen := seen || picked_app;
  end loop;
end;
$$;

-- Mirrors claim_webhook_events but EXPLAIN ANALYZE's the combined query
-- and rolls back the work, outputs a series of explains.
create or replace function explain_claim_webhook_events(
  p_max_apps int default 10,
  p_max_per_app int default 10
)
returns setof text
language plpgsql as $$
declare
  fake_machine_id uuid := gen_random_uuid();
  picked_app uuid;
  seen uuid[] := array[]::uuid[];
  plan_line text;
  accumulated text[] := array[]::text[];
  current_bucket int := ((extract(epoch from now())::bigint / 86400 / 30) % 13)::int;
  buckets int[] := array[current_bucket, (current_bucket + 12) % 13];
begin
  begin
    for i in 1..p_max_apps loop
      accumulated := accumulated || format('=== iter %s ===', i);

      for plan_line in
        execute 'explain (analyze, buffers, verbose)
                 with next_app as (
                   select app_id from webhook_events
                   where status = ''pending''
                     and partition_bucket = any($4)
                     and app_id <> all($1)
                   order by created_at
                   limit 1
                   for update skip locked
                 ),
                 locked as (
                   select p.ctid, p.tableoid, p.partition_bucket from next_app n
                   cross join lateral (
                     select ctid, tableoid, partition_bucket from webhook_events
                     where app_id = n.app_id
                       and partition_bucket = any($4)
                       and status = ''pending''
                     order by created_at
                     limit $2
                     for update skip locked
                   ) p
                 )
                 update webhook_events
                 set status = ''processing'',
                     machine_id = $3
                 from locked
                 where webhook_events.ctid = locked.ctid
                   and webhook_events.tableoid = locked.tableoid
                   and webhook_events.partition_bucket = locked.partition_bucket
                 returning webhook_events.*'
        using seen, p_max_per_app, fake_machine_id, buckets
      loop
        accumulated := accumulated || plan_line;
      end loop;

      -- Find which app the EXPLAIN just marked processing. Only rows touched
      -- by this explain run can match the disposable machine_id.
      select distinct app_id into picked_app
      from webhook_events
      where machine_id = fake_machine_id
        and app_id <> all(seen)
      limit 1;

      exit when picked_app is null;
      seen := seen || picked_app;
    end loop;

    -- Force rollback of everything in this subtransaction (the UPDATEs above).
    raise exception 'rollback_explain';
  exception
    when others then
      if sqlerrm <> 'rollback_explain' then
        raise;
      end if;
  end;

  return query select unnest(accumulated);
end;
$$;
