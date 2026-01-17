ALTER TABLE attrs ADD COLUMN etype text;
ALTER TABLE attrs ADD COLUMN label text;
ALTER TABLE attrs ADD COLUMN reverse_etype text;
ALTER TABLE attrs ADD COLUMN reverse_label text;

ALTER TABLE attrs
ADD CONSTRAINT attrs_etype_label_unique UNIQUE (app_id, etype, label);

ALTER TABLE attrs
ADD CONSTRAINT attrs_reverse_etype_label_unique UNIQUE (app_id, reverse_etype, reverse_label);

CREATE OR REPLACE FUNCTION check_attrs_unique_names ()
  RETURNS TRIGGER
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM attrs
     WHERE (app_id, reverse_etype, reverse_label) = (NEW.app_id, NEW.etype, NEW.label)
  ) THEN
    RAISE EXCEPTION 'trigger violation trg_attrs_unique_names'
       USING DETAIL = format('Key (app_id, reverse_etype, reverse_label)=(%s, %s, %s) already exists', NEW.app_id, NEW.etype, NEW.label),
              TABLE = 'attrs',
            ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM attrs
     WHERE (app_id, etype, label) = (NEW.app_id, NEW.reverse_etype, NEW.reverse_label)
  ) THEN
    RAISE EXCEPTION 'trigger violation trg_attrs_unique_names'
       USING DETAIL = format('Key (app_id, etype, label)=(%s, %s, %s) already exists', NEW.app_id, NEW.reverse_etype, NEW.reverse_label),
              TABLE = 'attrs',
            ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER trg_attrs_unique_names
  BEFORE INSERT OR UPDATE
  ON attrs
  FOR EACH ROW EXECUTE FUNCTION check_attrs_unique_names ();
