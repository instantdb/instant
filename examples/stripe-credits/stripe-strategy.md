# Stripe Strategy for Usage-Based Credits

A simple pattern for adding credit pack purchases to InstantDB apps.

## The Pattern

```
1. User signs in (required — credits are tied to accounts)
2. User clicks "Buy Credits"
3. Create/fetch Stripe customer, link to InstantDB user
4. Redirect to Stripe checkout (one-time payment)
5. User pays → webhook adds credits to account
6. InstantDB real-time subscription updates the UI instantly
7. User spends credits → server deducts per use
```

**The key idea:** Credits live on the user record. Stripe handles payment, our server handles the balance. The webhook uses Stripe session metadata for idempotency, and InstantDB's real-time subscriptions keep the UI in sync.

## Two Moving Parts

**1. Checkout API** — Verify auth, get or create Stripe customer, create session
```ts
// Verify the caller's identity from their auth token
const auth = await verifyAuth(request);
if (auth.error) return auth.error;
const userId = auth.user.id;

let customerId = user.stripeCustomerId;
if (!customerId) {
  const customer = await stripe.customers.create({ email: user.email });
  customerId = customer.id;
  await adminDb.transact(
    adminDb.tx.$users[userId].update({ stripeCustomerId: customerId })
  );
}

stripe.checkout.sessions.create({
  customer: customerId,
  mode: "payment",
  metadata: { instantUserId: userId },
});
```

**2. Webhook** — Add credits on successful payment

Only one event needed: `checkout.session.completed`. Unlike subscriptions, there's no ongoing lifecycle to track.

The webhook re-fetches the session from Stripe (rather than using the event payload) so the idempotency check works correctly on retries — the event payload's metadata is frozen at creation time and would always bypass the flag.

```ts
// Re-fetch session for live metadata (event payload is stale on retries)
const session = await stripe.checkout.sessions.retrieve(event.data.object.id);

if (session.metadata?.creditsProcessed === "true") break; // idempotent

await stripe.checkout.sessions.update(session.id, {
  metadata: { ...session.metadata, creditsProcessed: "true" },
});

await adminDb.transact(
  adminDb.tx.$users[userId].update({
    credits: currentCredits + CREDITS_PER_PACK,
  })
);
```

No separate sync endpoint is needed — InstantDB's real-time subscriptions update the client's balance the moment the webhook writes it.

## Idempotency

The webhook guards against duplicate deliveries:

1. Re-fetch the session from Stripe (event payload metadata is stale on retries)
2. Check `session.metadata.creditsProcessed`
3. If `"true"`, skip — already handled
4. Otherwise, set it to `"true"` and add credits

This prevents double-crediting if Stripe retries the webhook.

## Credit Deduction

Credits are spent server-side via the admin SDK. The user ID comes from a verified auth token, not from the request body:

```ts
// POST /api/generate
const auth = await verifyAuth(request);
if (auth.error) return auth.error;
const userId = auth.user.id;

const currentCredits = user.credits || 0;
if (currentCredits < 1) return 402;

await adminDb.transact([
  adminDb.tx.$users[userId].update({ credits: currentCredits - 1 }),
  adminDb.tx.haikus[haikuId]
    .update({ topic, content, createdAt: Date.now() })
    .link({ author: userId }),
]);
```

Credit checks and deductions happen server-side with a verified user identity — clients can't manipulate their balance or impersonate other users.

## Access Control

Haikus are scoped to their author via permissions:

```ts
// instant.perms.ts
haikus: {
  allow: {
    view: "isAuthor",
    create: "false",  // Created via admin SDK
    delete: "isAuthor",
  },
  bind: ["isAuthor", "auth.id in data.ref('author.id')"],
}
```

Query normally — permissions are automatic:
```ts
db.useQuery({ haikus: { $: { order: { createdAt: "desc" } } } });
```

## Production Testing

Use a 100% off coupon to test live without real charges:

1. Create a coupon in Stripe Dashboard (live mode): 100% off, one-time
2. Checkout has `allow_promotion_codes: true` — enter the code at payment
3. Credits are added at $0 cost
4. Delete the coupon after testing

## That's It

- Token-verified auth on all API routes = no user impersonation
- Stripe customer linked to InstantDB user = repeat purchases work
- Session metadata flag = idempotent credit fulfillment
- Webhook re-fetches session = idempotency works on retries
- Server-side deduction = tamper-proof balance
- InstantDB real-time subscriptions = instant UI updates after payment
- InstantDB permissions = users only see their own haikus

See `tutorial.md` for full implementation details.
