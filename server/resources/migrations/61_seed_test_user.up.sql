insert into
  instant_users (id, email, created_at, google_sub)
values
  (
    'f487bef2-59f7-4176-9ad2-9f05c0c5db26',
    'testuser@instantdb.com',
    '2023-01-23 09:48:35.941053',
    null
  ) on conflict do nothing;
