CREATE TABLE join_room_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  join_count BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX join_room_logs_app_id_idx ON join_room_logs (app_id);
CREATE INDEX join_room_logs_created_at_idx ON join_room_logs (created_at);

CREATE TRIGGER update_join_room_logs_updated_at
BEFORE UPDATE ON join_room_logs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
