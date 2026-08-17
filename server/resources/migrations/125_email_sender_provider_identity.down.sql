-- SES senders have no postmark_id. Remove them so the old NOT NULL
-- constraint can be restored. Templates that referenced them become
-- sender-less (ON DELETE SET NULL); verifications cascade.
DELETE FROM app_email_senders
WHERE email_provider = 'ses' OR postmark_id IS NULL;

ALTER TABLE app_email_senders
  DROP CONSTRAINT app_email_senders_email_provider_check,
  DROP COLUMN provider_id,
  DROP COLUMN email_provider,
  ALTER COLUMN postmark_id SET NOT NULL;
