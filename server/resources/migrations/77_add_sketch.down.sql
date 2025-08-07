drop table attr_sketches;
drop table wal_aggregator_status;

alter table triples replica identity default;

drop function unnest_2d(anyarray, out a anyarray);
