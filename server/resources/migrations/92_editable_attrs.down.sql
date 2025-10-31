drop trigger if exists prevent_required_on_reserved_attrs_trigger on attrs;
drop trigger if exists prevent_update_system_catalog_attr_trigger on attrs;
drop trigger if exists prevent_update_system_catalog_ident_trigger on idents;

drop function if exists prevent_required_on_reserved_attrs();
drop function if exists prevent_update_system_catalog_attr();
drop function if exists prevent_update_system_catalog_ident();
