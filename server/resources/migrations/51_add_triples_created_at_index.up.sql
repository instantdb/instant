CREATE INDEX IF NOT EXISTS triples_created_at_idx
  ON triples(app_id, attr_id, created_at);
