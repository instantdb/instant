CREATE TABLE app_files_to_sweep (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id uuid NOT NULL REFERENCES apps(id),
    path text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW(),
    UNIQUE (app_id, path)
);

-- Whenever we delete file triples we want to ensure they are scheduled for
-- deletion in S3.
CREATE FUNCTION create_file_to_sweep()
RETURNS trigger AS $$
BEGIN
    -- This should match the attr_id for $files.path
    IF OLD.attr_id = '96653230-13ff-ffff-2a34-f04cffffffff' THEN
        INSERT INTO app_files_to_sweep (app_id, path)
        VALUES (
            OLD.app_id,
            OLD.value #>> '{}'  -- Extract from JSON
        )
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insert_files_to_sweep_trigger
    AFTER DELETE ON triples
    FOR EACH ROW
    EXECUTE FUNCTION create_file_to_sweep();

-- When file triples are created, the path may be similar to one that was
-- scheduled for deletion previously. We want to remove this from the sweep table
-- since they are no longer candidates for deletion
CREATE FUNCTION delete_file_to_sweep()
RETURNS trigger AS $$
BEGIN
    -- This should match the attr_id for $files.path
    IF NEW.attr_id = '96653230-13ff-ffff-2a34-f04cffffffff' THEN
        DELETE FROM app_files_to_sweep 
        WHERE app_id = NEW.app_id 
        AND path = NEW.value #>> '{}';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delete_files_to_sweep_trigger
    AFTER INSERT ON triples
    FOR EACH ROW
    EXECUTE FUNCTION delete_file_to_sweep();
