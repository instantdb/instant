CREATE TABLE instant_cli_logins (
  id uuid PRIMARY KEY,
  secret bytea NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  user_id uuid REFERENCES instant_users(id) ON DELETE CASCADE
);

CREATE INDEX instant_cli_logins_user_id_index
  ON instant_cli_logins (user_id);

ALTER TABLE instant_oauth_redirects
  ADD COLUMN ticket uuid
  REFERENCES instant_cli_logins(id) ON DELETE SET NULL;