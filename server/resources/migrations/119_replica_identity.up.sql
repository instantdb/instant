-- Include app_id in the replica identity of the app-scoped tables using existing unique indexes
alter table idents replica identity using index app_ident_uq;
alter table attr_sketches replica identity using index attr_sketches_app_id_attr_id_key;
alter table app_admin_tokens replica identity using index app_admin_tokens_app_id_key;
alter table app_email_templates replica identity using index app_email_templates_app_id_email_type_key;
alter table app_email_verifications replica identity using index app_email_verifications_app_id_sender_id_key;

-- app_email_senders has no unique index covering app_id (only unique(email)),
alter table app_email_senders replica identity full;
