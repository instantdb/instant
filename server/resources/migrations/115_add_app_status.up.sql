ALTER TABLE apps
  ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'read-only', 'disabled'));
