CREATE OR REPLACE FUNCTION current_unix_timestamp_ms()
RETURNS bigint AS $$
BEGIN
  RETURN (EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC') * 1000)::BIGINT;
END;
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE triples
ADD COLUMN created_at bigint DEFAULT current_unix_timestamp_ms();
