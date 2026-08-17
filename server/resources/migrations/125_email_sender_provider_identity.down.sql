ALTER TABLE app_email_senders
  DROP CONSTRAINT app_email_senders_email_provider_check,
  DROP COLUMN provider_id,
  DROP COLUMN email_provider,
  ALTER COLUMN postmark_id SET NOT NULL;
