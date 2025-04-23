with u_ins as (
  insert into
    instant_users (id, email)
  values
    (
      '6f0f64c9-207f-4b35-aec7-82739dcde58e',
      'stopa@instantdb.com'
    ) on conflict (email) do nothing returning id
),
u as (
  select
    id
  from
    u_ins
  union
  all
  select
    id
  from
    instant_users
  where
    email = 'stopa@instantdb.com'
),
app_ins as (
  insert into
    apps (id, creator_id, title)
  select
    'fc5a4977-910a-43d9-ac28-39c7837c1eb5',
    id,
    'homepage'
  from
    u on conflict do nothing
)
insert into
  rules (app_id, code)
values
  (
    'fc5a4977-910a-43d9-ac28-39c7837c1eb5',
    '{ "$default": { "allow": { "$default": "false" } } }'
  ) on conflict do nothing;
