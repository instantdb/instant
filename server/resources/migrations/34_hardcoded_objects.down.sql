drop trigger prevent_delete_system_catalog_ident_trigger on idents;
drop function prevent_delete_system_catalog_ident;

drop trigger prevent_delete_system_catalog_attr_trigger on attrs;
drop function prevent_delete_system_catalog_attr;

drop trigger prevent_delete_system_catalog_app_trigger on apps;
drop function prevent_delete_system_catalog_app;

drop trigger prevent_delete_system_catalog_user_trigger on instant_users;
drop function prevent_delete_system_catalog_user;

delete from apps where id = 'a1111111-1111-1111-1111-111111111ca7';

delete from instant_users where id = 'e1111111-1111-1111-1111-111111111ca7';
