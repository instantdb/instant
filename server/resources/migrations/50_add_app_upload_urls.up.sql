CREATE TABLE app_upload_urls (
  id uuid PRIMARY KEY,
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

create index on app_upload_urls(app_id);
