-- Self-hosted subscriptions cannot be represented by the previous schema.
UPDATE orgs
SET subscription_id = NULL
WHERE subscription_id IN (
  SELECT id FROM instant_subscriptions WHERE source = 'self-hosted'
);

UPDATE apps
SET subscription_id = NULL
WHERE subscription_id IN (
  SELECT id FROM instant_subscriptions WHERE source = 'self-hosted'
);

DELETE FROM instant_subscriptions
WHERE source = 'self-hosted';

ALTER TABLE instant_subscriptions
DROP CONSTRAINT valid_subscription_source;

ALTER TABLE instant_subscriptions
ALTER COLUMN stripe_customer_id SET NOT NULL,
ALTER COLUMN stripe_event_id SET NOT NULL;

ALTER TABLE instant_subscriptions
DROP COLUMN source;
