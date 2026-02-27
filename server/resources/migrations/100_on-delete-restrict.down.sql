alter type attr_on_delete rename to attr_on_delete_old;

create type attr_on_delete as enum ('cascade');

update attrs set on_delete = null where on_delete::text = 'restrict';
update attrs set on_delete_reverse = null where on_delete_reverse::text = 'restrict';

alter table attrs alter column on_delete type attr_on_delete using on_delete::text::attr_on_delete;
alter table attrs alter column on_delete_reverse type attr_on_delete using on_delete_reverse::text::attr_on_delete;

drop type attr_on_delete_old;
