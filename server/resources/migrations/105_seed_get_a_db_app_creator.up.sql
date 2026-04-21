insert into
  instant_users (id, email, created_at, google_sub)
values
  (
    '9bacaf3d-0c7d-46e6-bb1b-4b9fdb9c5b61',
    'hello+getadbapps@instantdb.com',
    '2026-04-21 00:00:00',
    null
  ) on conflict do nothing;
