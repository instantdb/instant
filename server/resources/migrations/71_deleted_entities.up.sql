CREATE TABLE deleted_entities (
    app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    entity_id uuid NOT NULL,
    etype text NOT NULL,
    deleted_at bigint NOT NULL DEFAULT current_unix_timestamp_ms(),
    PRIMARY KEY(app_id, entity_id, etype)
);
