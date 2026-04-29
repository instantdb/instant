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
  processed_isn isn not null,
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

create index on webhooks (app_id);

create type webhook_payload_status as enum ('pending', 'processing', 'success', 'error', 'failed');

create table webhook_payloads(
  id uuid not null,
  app_id uuid not null references apps (id) on delete cascade,
  webhook_id uuid not null references webhooks (id) on delete cascade,
  isn isn not null,
  status webhook_payload_status not null,
  machine_id uuid,
  status_code int,
  response text,
  attempts int not null default 0,
  -- Each bucket spans 30 days. 13 buckets cycle every 390 days, giving ≥360
  -- days of retention. Truncate the next-to-be-reused bucket before writes
  -- wrap around.
  partition_bucket int not null,
  created_at timestamp with time zone not null default now(),
  next_attempt_after timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id, partition_bucket)
) partition by range (partition_bucket);

create table webhook_payloads_0 partition of webhook_payloads for values from (0) to (1);
create table webhook_payloads_1 partition of webhook_payloads for values from (1) to (2);
create table webhook_payloads_2 partition of webhook_payloads for values from (2) to (3);
create table webhook_payloads_3 partition of webhook_payloads for values from (3) to (4);
create table webhook_payloads_4 partition of webhook_payloads for values from (4) to (5);
create table webhook_payloads_5 partition of webhook_payloads for values from (5) to (6);
create table webhook_payloads_6 partition of webhook_payloads for values from (6) to (7);
create table webhook_payloads_7 partition of webhook_payloads for values from (7) to (8);
create table webhook_payloads_8 partition of webhook_payloads for values from (8) to (9);
create table webhook_payloads_9 partition of webhook_payloads for values from (9) to (10);
create table webhook_payloads_10 partition of webhook_payloads for values from (10) to (11);
create table webhook_payloads_11 partition of webhook_payloads for values from (11) to (12);
create table webhook_payloads_12 partition of webhook_payloads for values from (12) to (13);

create trigger update_updated_at_trigger
before update on webhook_payloads
for each row
execute function update_updated_at_column();

create index on webhook_payloads (app_id);
create index on webhook_payloads (webhook_id);
create index on webhook_payloads (created_at) where status = 'pending';
create index on webhook_payloads (app_id, created_at) where status = 'pending';
create index on webhook_payloads (updated_at) where status = 'processing';


-- Claims pending webhook_payloads, claiming up to 10 per app for up to 10 apps
-- (configurable with optional 2nd and 3rd arguments).
-- Uses SKIP LOCKED so concurrent workers don't collide.
-- Updates status to 'processing' and records machine_id.
-- Restricts the scan to the current and previous partition_bucket.
create or replace function claim_webhook_payloads(
  p_machine_id uuid,
  p_max_apps int default 10,
  p_max_per_app int default 10
)
returns setof webhook_payloads
language plpgsql as $$
declare
  r webhook_payloads;
  picked_app uuid;
  seen uuid[] := array[]::uuid[];
  current_bucket int := ((extract(epoch from now())::bigint / 86400 / 30) % 13)::int;
  buckets int[] := array[current_bucket, (current_bucket + 12) % 13];
begin
  for i in 1..p_max_apps loop
    picked_app := null;
    for r in
      with next_app as (
        select app_id from webhook_payloads
        where status = 'pending'
          and partition_bucket = any(buckets)
          and app_id <> all(seen)
        order by created_at
        limit 1
        for update skip locked
      ),
      locked as (
        select p.id, p.partition_bucket from next_app n
        cross join lateral (
          select id, partition_bucket from webhook_payloads
          where app_id = n.app_id
            and partition_bucket = any(buckets)
            and status = 'pending'
          order by created_at
          limit p_max_per_app
          for update skip locked
        ) p
      )
      update webhook_payloads
      set status = 'processing',
          machine_id = p_machine_id
      from locked
      where webhook_payloads.id = locked.id
        and webhook_payloads.partition_bucket = locked.partition_bucket
      returning webhook_payloads.*
    loop
      return next r;
      picked_app := r.app_id;
    end loop;

    exit when picked_app is null;
    seen := seen || picked_app;
  end loop;
end;
$$;

-- Mirrors claim_webhook_payloads but EXPLAIN ANALYZE's the combined query
-- and rolls back the work, outputs a series of explains.
create or replace function explain_claim_webhook_payloads(
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
                   select app_id from webhook_payloads
                   where status = ''pending''
                     and partition_bucket = any($4)
                     and app_id <> all($1)
                   order by created_at
                   limit 1
                   for update skip locked
                 ),
                 locked as (
                   select p.id, p.partition_bucket from next_app n
                   cross join lateral (
                     select id, partition_bucket from webhook_payloads
                     where app_id = n.app_id
                       and partition_bucket = any($4)
                       and status = ''pending''
                     order by created_at
                     limit $2
                     for update skip locked
                   ) p
                 )
                 update webhook_payloads
                 set status = ''processing'',
                     machine_id = $3
                 from locked
                 where webhook_payloads.id = locked.id
                   and webhook_payloads.partition_bucket = locked.partition_bucket
                 returning webhook_payloads.*'
        using seen, p_max_per_app, fake_machine_id, buckets
      loop
        accumulated := accumulated || plan_line;
      end loop;

      -- Find which app the EXPLAIN just marked processing. Only rows touched
      -- by this explain run can match the disposable machine_id.
      select distinct app_id into picked_app
      from webhook_payloads
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
