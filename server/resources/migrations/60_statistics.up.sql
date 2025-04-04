create statistics if not exists triples_attr_value_mcv (mcv)
  on attr_id, checked_data_type, ave, value
  from triples;

alter table triples alter column attr_id set statistics 2500;
alter table triples alter column value set statistics 2500;
