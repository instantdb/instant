# Stripe Strategy for Buy-Once Products

A simple pattern for adding Stripe payments to InstantDB apps.

## The Pattern

```
1. User clicks "Buy"
2. Generate a token, save to localStorage
3. Pass token to Stripe checkout via metadata
4. Webhook creates purchase record with that token
5. User lands on success page — token already in localStorage
6. Query with token → protected content unlocked
```

**The key idea:** Generate the token *before* payment, not after. This way the success page already has access — no waiting for webhooks.

## Three Moving Parts

**1. Buy Button** — Generate token, save locally, send to checkout API
```ts
const token = crypto.randomUUID();
localStorage.setItem(TOKEN_KEY, token);
fetch("/api/checkout", { body: JSON.stringify({ token }) });
```

**2. Checkout API** — Pass token to Stripe in metadata
```ts
stripe.checkout.sessions.create({
  metadata: { token },
  // ... price, success_url, etc.
});
```

**3. Webhook** — Read token from metadata, create purchase
```ts
const token = session.metadata?.token;
await createPurchase({ token, email, stripeSessionId });
```

## Access Control

Use InstantDB field-level permissions to protect content:

```ts
// instant.perms.ts
wallpapers: {
  allow: { view: "true" },
  fields: {
    fullResUrl: "ruleParams.token in data.ref('purchases.token')"
  }
}
```

Query with the token:
```ts
db.useQuery({ wallpapers: {} }, { ruleParams: { token } });
```

Valid token → `fullResUrl` returned. Invalid token → omitted.

## Recovery

Users can recover purchases via email:

1. User enters email → InstantDB sends magic code
2. User verifies → query purchases by email
3. Save token to localStorage → done

No external email service needed — InstantDB handles it.

## That's It

- Token generated before checkout = no race conditions
- Webhook is the only thing that creates purchases = single source of truth
- Permissions enforce access server-side = secure
- localStorage + email recovery = no accounts needed

See `tutorial.md` for full implementation details.
