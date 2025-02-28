CREATE TABLE app_files_to_sweep (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id uuid NOT NULL,
    location_id text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW(),
    UNIQUE (app_id, location_id)
);

-- Whenever we delete file triples we want to ensure they are scheduled for
-- deletion in S3.
CREATE FUNCTION create_file_to_sweep()
RETURNS trigger AS $$
BEGIN
    -- This should match the attr_id for $files.location-id
    IF OLD.attr_id = '96653230-13ff-ffff-2a34-b40fffffffff' THEN
        INSERT INTO app_files_to_sweep (app_id, location_id)
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

-- Whenever we upload a file with the same path we create a new location-id for
-- it. We add the old location-id to the sweep table to ensure that the old file
-- is cleaned up
CREATE FUNCTION create_file_to_sweep_on_update()
RETURNS trigger AS $$
BEGIN
    -- Check if we're updating from the file location attribute
    IF OLD.attr_id = '96653230-13ff-ffff-2a34-b40fffffffff' THEN
        -- Only schedule for deletion if the value actually changed
        IF OLD.value != NEW.value THEN
            INSERT INTO app_files_to_sweep (app_id, location_id)
            VALUES (
                OLD.app_id,
                OLD.value #>> '{}'  -- Extract from JSON
            )
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_files_to_sweep_trigger
    AFTER UPDATE ON triples
    FOR EACH ROW
    EXECUTE FUNCTION create_file_to_sweep_on_update();
