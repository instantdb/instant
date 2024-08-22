CREATE TABLE rules (
  app_id uuid PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  code jsonb NOT NULL
);
CREATE INDEX rules_app_id ON rules (app_id);
