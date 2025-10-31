-- Run first in prod: `create index concurrently transactions_app_id_id_idx on transactions (app_id, id desc);`
create index if not exists transactions_app_id_id_idx on transactions (app_id, id desc);

create table sync_subs (
  id uuid primary key,
  app_id uuid not null references apps (id) on delete cascade,
  query text not null,
  sent_tx_id bigint, -- I think we don't need to track the tx_id on our end
  token_hash bytea,
  is_admin boolean not null,
  -- We may want to do something to prevent multiple sessions from subscribing to the same sync sub
  user_id uuid
);

create index on sync_subs (app_id);

create type topics_idx as enum ('any','ea','eav','av','ave','vae');

create table sync_sub_topics (
  sync_sub_id uuid not null references sync_subs(id) on delete cascade,
  topic_num integer not null,
  idx topics_idx[] not null,
  e bytea[] not null, -- any represented as '\x'::bytea
  a bytea[] not null, -- any represented as '\x'::bytea
  v jsonb[] not null, -- any represented as {}
  v_filter jsonb,
  primary key (sync_sub_id, topic_num)
);

create index sync_subs_topics_idx on sync_sub_topics using gin (idx, e, a, v);


-- create table transaction_meta (
--   transaction_id bigint primary key references transactions (id) on delete cascade,
--   app_id uuid not null references apps (id) on delete cascade
-- );

-- create index on transaction_meta (app_id);


-- same as unnest, but will not flatten a 2-dimensional array
-- select unnest_2d('{{1,2},{3,4}}') as rows
--    rows
--   ------
--    {1,2}
--    {3,4}
create or replace function unnest_2d(anyarray, out a anyarray)
  returns setof anyarray
  language plpgsql
  immutable parallel safe strict
as $$
begin
  if array_length($1, 1) is null then
    return;
  end if;

  foreach a slice 1 in array $1 loop
    return next;
  end loop;
end;
$$;
