-- Self-hosted subscriptions cannot be represented by the previous schema.
-- Deleting them also clears apps.subscription_id via ON DELETE SET NULL.
DELETE FROM instant_subscriptions
WHERE source = 'self-hosted';

ALTER TABLE instant_subscriptions
DROP CONSTRAINT valid_subscription_source;

ALTER TABLE instant_subscriptions
ALTER COLUMN stripe_customer_id SET NOT NULL,
ALTER COLUMN stripe_event_id SET NOT NULL;

ALTER TABLE instant_subscriptions
DROP COLUMN source;
