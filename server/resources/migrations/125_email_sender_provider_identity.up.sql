ALTER TABLE app_email_senders
  ALTER COLUMN postmark_id DROP NOT NULL,
  ADD COLUMN email_provider text NOT NULL DEFAULT 'postmark',
  ADD COLUMN provider_id text;

UPDATE app_email_senders
SET provider_id = postmark_id::text
WHERE postmark_id IS NOT NULL;

ALTER TABLE app_email_senders
  ADD CONSTRAINT app_email_senders_email_provider_check
  CHECK (email_provider IN ('postmark', 'ses'));
