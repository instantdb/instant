# The Weekly Dispatch

A reference implementation for adding Stripe subscriptions to InstantDB apps.

Recurring payments with auth-based access control — users sign in to subscribe.

## Features

- Stripe Checkout for subscriptions
- Webhook-based status sync
- Field-level permissions for premium content
- Billing portal for subscription management
- Cancellation handling with grace period

## Docs

- `stripe-strategy.md` — The subscription pattern explained
- `tutorial.md` — Step-by-step implementation guide
- `subscription.md` — How the subscription flow works

## Setup

```bash
pnpm install
cp .env.example .env.local  # Add your keys
npx instant-cli push schema
npx instant-cli push perms
npx tsx scripts/seed.ts  # Populate sample posts
pnpm dev
```

## Stripe Setup

1. Create a [Stripe account](https://dashboard.stripe.com/register) (or use an existing one)

2. In test mode, create a product with a $5/month recurring price

3. Add to your `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. Install the Stripe CLI and forward webhooks locally:
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the webhook signing secret it prints to `STRIPE_WEBHOOK_SECRET`.

5. Run the app:
   ```bash
   pnpm dev
   ```

Use test card `4242 4242 4242 4242` with any future expiry and CVC.


## Scripts

```bash
pnpm dev                        # Start dev server
npx instant-cli push schema     # Push schema changes
npx instant-cli push perms      # Push permission changes
```
