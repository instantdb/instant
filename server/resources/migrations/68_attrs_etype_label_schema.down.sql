DROP TRIGGER IF EXISTS trg_attrs_unique_names ON attrs;
DROP FUNCTION check_attrs_unique_names;

ALTER TABLE attrs DROP CONSTRAINT attrs_etype_label_unique;
ALTER TABLE attrs DROP CONSTRAINT attrs_reverse_etype_label_unique;

ALTER TABLE attrs DROP COLUMN etype;
ALTER TABLE attrs DROP COLUMN label;
ALTER TABLE attrs DROP COLUMN reverse_etype;
ALTER TABLE attrs DROP COLUMN reverse_label;
