CREATE TABLE app_admin_tokens(
  token uuid primary key,
  app_id uuid NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_app_id
    FOREIGN KEY(app_id)
    REFERENCES apps(id)
    ON DELETE CASCADE
);
