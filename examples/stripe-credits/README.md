# Haiku Generator

A reference implementation for adding usage-based Stripe payments to InstantDB apps.

Credit pack purchases with real-time balance updates — users sign in, buy credits, and spend them.

## Features

- Stripe Checkout for credit packs
- Webhook-based credit fulfillment
- Idempotent processing via Stripe session metadata
- Server-side credit deduction per generation
- Real-time balance and history via InstantDB

## Docs

- `stripe-strategy.md` — The credit pack pattern explained
- `tutorial.md` — Step-by-step implementation guide
- `credits.md` — How the credit flow works

## Setup

```bash
pnpm install
cp .env.example .env.local  # Add your keys
npx instant-cli push schema
npx instant-cli push perms
pnpm dev
```

## Stripe Setup

1. Create a [Stripe account](https://dashboard.stripe.com/register) (or use an existing one)

2. In test mode, create a product with a $2.00 one-time price

3. Add to your `.env.local`:
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
