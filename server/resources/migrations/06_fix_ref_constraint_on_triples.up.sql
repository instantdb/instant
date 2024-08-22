ALTER TABLE triples DROP CONSTRAINT ref_values_are_uuid;
ALTER TABLE triples
  ADD CONSTRAINT ref_values_are_uuid
  CHECK (
    CASE WHEN eav OR vae THEN
        jsonb_typeof(value) = 'string' AND 
        (value->>0)::uuid IS NOT NULL
    ELSE TRUE
    END
);

