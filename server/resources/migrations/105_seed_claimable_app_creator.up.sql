insert into
  instant_users (id, email, created_at, google_sub)
values
  (
    '5c3df703-293a-4d35-bf2e-c2018aeb4dc6',
    'hello+claimableappsdev@instantdb.com',
    '2026-04-21 00:00:00',
    null
  ),
  (
    'a5b08a1d-8c87-4f3b-99ed-5eefb4896f58',
    'hello+claimableapps@instantdb.com',
    '2026-04-21 00:00:00',
    null
  ) on conflict do nothing;
