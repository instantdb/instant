UPDATE attrs
   SET etype = idents.etype,
       label = idents.label
  FROM idents
 WHERE attrs.forward_ident = idents.id;

ALTER TABLE attrs ALTER COLUMN etype SET NOT NULL;
ALTER TABLE attrs ALTER COLUMN label SET NOT NULL;

UPDATE attrs
   SET reverse_etype = idents.etype,
       reverse_label = idents.label
  FROM idents
 WHERE attrs.reverse_ident = idents.id;
