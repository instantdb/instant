insert into
  instant_users (id, email, created_at, google_sub)
values
  (
    'f487bef2-59f7-4176-9ad2-9f05c0c5db26',
    'testuser@instantdb.com',
    '2023-01-23 09:48:35.941053',
    null
  ),
  (
    '6f0f64c9-207f-4b35-aec7-82739dcde58e',
    'stopa@instantdb.com',
    '2024-09-10 00:01:36.000999',
    106722728518978660837
  ),
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
  ) on conflict (id) do nothing;
