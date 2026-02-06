# Stripe Strategy for Subscriptions

A simple pattern for adding Stripe subscriptions to InstantDB apps.

## The Pattern

```
1. User signs in (required — subscriptions are tied to accounts)
2. User clicks "Subscribe"
3. Create/fetch Stripe customer, link to InstantDB user
4. Redirect to Stripe checkout
5. User pays → webhook updates subscriptionStatus
6. Success page syncs eagerly (beats webhook race)
7. Query with auth → premium content unlocked
```

**The key idea:** Stripe is the source of truth. Our database is a cache. When uncertain, fetch from Stripe and update our cache.

## Three Moving Parts

**1. Checkout API** — Verify auth, get or create Stripe customer, create session
```ts
// Verify the caller's identity via their refresh token
const auth = await verifyAuth(request); // extracts Bearer token, calls adminDb.auth.verifyToken()
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
  mode: "subscription",
  metadata: { instantUserId: userId },
});
```

**2. Webhook** — Update subscription status on all changes
```ts
// checkout.session.completed
await adminDb.transact(
  adminDb.tx.$users[userId].update({ subscriptionStatus: "active" })
);

// customer.subscription.updated (find user by stripeCustomerId first)
await adminDb.transact(
  adminDb.tx.$users[userId].update({ subscriptionStatus: subscription.status })
);

// customer.subscription.deleted
await adminDb.transact(
  adminDb.tx.$users[userId].update({ subscriptionStatus: "canceled" })
);
```

**3. Sync on Success** — Beat the webhook race
```ts
useEffect(() => {
  if (success && user) {
    fetch("/api/stripe/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.refresh_token}`,
      },
    });
  }
}, [success, user]);
```

## Access Control

Use InstantDB permissions with `auth`

```ts
// instant.perms.ts
const rules = {
  posts: {
    allow: { view: "true" },
    bind: ["isSubscriber", "auth.subscriptionStatus == 'active'"],
    fields: {
      content: "!data.isPremium || isSubscriber"
    }
  }
};
```

Query normally — permissions are automatic:
```ts
db.useQuery({ posts: {} });
```

Subscribed user → `content` returned. Unsubscribed → omitted.

## Sync Strategy

Sync Stripe data in multiple places:

| Location | Why |
|----------|-----|
| Checkout route | Catch existing subs before creating duplicates |
| Portal route | Sync before billing portal (catches cancellations) |
| Success page | Beat the webhook race |
| Webhook | Backup for all Stripe events |

## Cancellation States

```
Active ──[cancels]──▶ Canceling ──[period ends]──▶ Canceled
   ▲                      │                            │
   └──────────────────────┴────────[resubscribes]──────┘
```

- **Active** — Full access
- **Canceling** — Still has access until `cancelAt` date
- **Canceled** — No access, must resubscribe

Use `cancelAt` timestamp to show "ends on [date]" message.
