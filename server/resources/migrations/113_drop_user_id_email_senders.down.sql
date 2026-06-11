ALTER TABLE app_email_senders
ADD column user_id uuid
REFERENCES instant_users(id)
ON DELETE CASCADE;
