create type attr_on_delete as enum ('cascade');

alter table attrs add column on_delete attr_on_delete;
