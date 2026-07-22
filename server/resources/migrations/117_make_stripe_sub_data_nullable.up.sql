ALTER TABLE instant_subscriptions
ADD COLUMN source text NOT NULL DEFAULT 'stripe';

ALTER TABLE instant_subscriptions
ALTER COLUMN stripe_customer_id DROP NOT NULL,
ALTER COLUMN stripe_event_id DROP NOT NULL;

ALTER TABLE instant_subscriptions
ADD CONSTRAINT valid_subscription_source CHECK (
  (
    source = 'stripe'
    AND stripe_customer_id IS NOT NULL
    AND stripe_event_id IS NOT NULL
  )
  OR
  (
    source = 'self-hosted'
    AND stripe_customer_id IS NULL
    AND stripe_subscription_id IS NULL
    AND stripe_event_id IS NULL
    AND (
      (app_id IS NOT NULL AND subscription_type_id = 2)
      OR (org_id IS NOT NULL AND subscription_type_id = 3)
    )
  )
);
