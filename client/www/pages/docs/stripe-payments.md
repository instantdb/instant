---
title: Stripe Payments
description: How to add payments to your Instant app with Stripe.
---

The quickest way to add Stripe to your Instant app is to tell your LLM to do it. Just say "add Stripe payments" and follow along step by step.

For more guidance we've put together three reference examples with tutorials you
can follow along. Each example also has addiitonal docs you can copy and paste for your agent.

## Stripe Examples

All three patterns share the same core idea: **Stripe handles payment, Instant
handles data and access control.** When a
payment completes, Stripe's webhook writes to Instant via the
[Admin SDK](/docs/backend), and any queries on the client get updated
instantly.

### One-off purchase

This example is for a wallpaper store where users buy a pack and get immediate
access to high-resolution downloads. It's a one-off payment and no user accounts required to minimize friction.

- [Example repo](https://github.com/instantdb/instant/tree/main/examples/stripe-one-off) with [step-by-step tutorial](https://github.com/instantdb/instant/tree/main/examples/stripe-one-off/tutorial.md)
- [Strategy](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-one-off/stripe-strategy.md) and [payment flow](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-one-off/purchase.md) docs to help your agent implement the pattern

**How it works:**

1. User clicks "Buy" — a UUID token is generated and saved to `localStorage`
   _before_ redirecting to Stripe Checkout
2. The token is passed to Stripe via session metadata
3. On payment, a webhook creates a `purchase` record in Instant linked to that
   token
4. Instant's [field-level permissions](/docs/permissions#field-level-permissions)
   gate the protected content — only queries that include a valid purchase token
   (via `ruleParams`) can see the full-resolution URLs
5. Bonus: Uses [magic code auth](/docs/auth/magic-codes) to let users sign in
   and retrieve past purchases

### Subscription

This example is for a blog where free users see teasers and subscribers get full
articles. It uses recurring billing with Stripe and auth-based access control.

- [Example repo](https://github.com/instantdb/instant/tree/main/examples/stripe-subscription) with [step-by-step tutorial](https://github.com/instantdb/instant/tree/main/examples/stripe-subscription/tutorial.md)
- [Strategy](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-subscription/stripe-strategy.md) and [subscription flow](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-subscription/subscription.md) docs to help your agent implement the pattern

**How it works:**

1. User signs in via [magic code auth](/docs/auth/magic-codes)
2. Checkout creates or reuses a Stripe customer linked to the Instant user
3. Stripe webhooks sync `subscriptionStatus` to the `$users` record whenever
   the subscription changes (created, updated, canceled, deleted)
4. Instant's [field-level permissions](/docs/permissions#field-level-permissions)
   use `auth.subscriptionStatus` to gate premium content — the `content` field is
   simply omitted from query results for non-subscribers
5. Stripe's Billing Portal handles cancellation and payment method updates

### Credits

This example is for a haiku generator where each generation costs one credit.
Users buy packs of 10 credits for $2. It's a pay-per-use model with real-time balance updates.

- [Example repo](https://github.com/instantdb/instant/tree/main/examples/stripe-credits) with [step-by-step tutorial](https://github.com/instantdb/instant/tree/main/examples/stripe-credits/tutorial.md)
- [Strategy](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-credits/stripe-strategy.md) and [credit flow](https://raw.githubusercontent.com/instantdb/instant/main/examples/stripe-credits/credits.md) docs to help your agent implement the pattern

**How it works:**

1. User signs in via [magic code auth](/docs/auth/magic-codes)
2. Checkout creates a Stripe customer and processes a one-time payment for a
   credit pack
3. The webhook adds credits to the user's `credits` field, with idempotency
   protection via Stripe session metadata to prevent double-crediting on retries
4. A server-side API route verifies the user has enough credits, then
   atomically deducts a credit and creates the result in a single
   [transaction](/docs/instaml)
5. Instant's real-time subscriptions keep the credit balance and history
   updated in the UI instantly
