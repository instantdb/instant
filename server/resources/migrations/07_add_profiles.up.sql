CREATE TABLE instant_profiles (
  id uuid PRIMARY KEY REFERENCES instant_users(id) ON DELETE CASCADE,
  meta jsonb NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
