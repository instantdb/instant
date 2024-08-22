alter table app_email_senders
add column user_id uuid
references instant_users(id)
on delete cascade;

update app_email_senders
    set user_id =
    (select creator_id from apps a where a.id = app_id);

alter table app_email_senders
    alter column user_id
    set not null;