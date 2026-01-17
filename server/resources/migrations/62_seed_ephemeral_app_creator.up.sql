insert into
  instant_users (id, email, created_at, google_sub)
values
  (
    'dda67f26-6962-479e-b476-60e4b6963b74',
    'hello+ephemeralappsdev@instantdb.com',
    '2024-04-08 17:20:17.644783',
    null
  ),
  (
    'ee25bd4e-b968-4c1c-bde4-df046ef0dade',
    'hello+ephemeralapps@instantdb.com',
    '2024-04-08 17:20:42.704454',
    null
  ) on conflict do nothing;
