drop statistics triples_attr_value_mcv;

alter table triples alter column attr_id set statistics -1;
alter table triples alter column value set statistics -1;
