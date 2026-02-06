# Adding Subscriptions to Your App

So you've built a newsletter app and want to charge for premium content? This tutorial walks through adding Stripe subscriptions with InstantDB for access control.

By the end, you'll have:
- A "Subscribe" button that creates a Stripe checkout session
- Webhooks that track subscription lifecycle
- Auth-based access control for premium content
- A billing portal for subscription management

Let's get started!

1. [How it works](#how-it-works)
1. [Setting up Stripe](#setting-up-stripe)
1. [Updating the schema](#updating-the-schema)
1. [Creating the checkout flow](#creating-the-checkout-flow)
1. [Handling webhooks](#handling-webhooks)
1. [Protecting content with permissions](#protecting-content-with-permissions)
1. [The sync strategy](#the-sync-strategy)
1. [Adding the billing portal](#adding-the-billing-portal)
1. [Testing your integration](#testing-your-integration)
1. [Common mistakes](#common-mistakes)
1. [Fin](#fin)

## How it works

Before diving into code, let's understand the flow:

```
1. User signs in → Required for subscriptions
2. User clicks "Subscribe" → Redirected to Stripe
3. User pays → Webhook updates subscriptionStatus
4. Success page syncs eagerly → Beats the webhook race
5. Query with auth → Premium content unlocked
```

The key insight: Stripe is the source of truth. Our database is a cache. When uncertain, fetch from Stripe and update our cache.

## Setting up Stripe

First, create a Stripe account at [stripe.com](https://stripe.com) if you haven't already.

Install the Stripe SDK:

```bash
pnpm add stripe
```

### Create a subscription product

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products) → Products
2. Click "Add product"
3. Name: "Premium Subscription" (or whatever you like)
4. Pricing: $5/month, recurring
5. Copy the Price ID (`price_...`)

### Get your API keys

Grab your keys from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys) and add to `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...  # We'll get this shortly
```

Create a Stripe client:

```ts
// src/lib/stripe.ts
import Stripe from "stripe";

export function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export function getPriceId() {
  return process.env.STRIPE_PRICE_ID!;
}
```

## Updating the schema

We store subscription data directly on the user:

```ts
// instant.schema.ts
$users: i.entity({
  email: i.string().unique().indexed().optional(),
  stripeCustomerId: i.string().optional(),
  subscriptionStatus: i.string().optional(), // 'active' | 'canceled' | etc.
  cancelAt: i.number().optional(),           // Unix timestamp
}),
```

Push your schema:

```bash
npx instant-cli push schema --yes
```

## Creating the checkout flow

The subscribe button:
1. Sends the user's auth token to the checkout API
2. Server verifies identity, gets or creates a Stripe customer
3. Redirects to Stripe checkout

```tsx
// SubscribeButton.tsx
async function handleSubscribe() {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.refresh_token}`,
    },
  });
  const { url } = await res.json();
  window.location.href = url;
}
```

The checkout API route verifies the caller's identity using their refresh token before proceeding:

```ts
// src/app/api/stripe/checkout/route.ts
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request); // see src/lib/auth.ts
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const user = await getUser(userId);

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { instantUserId: userId },
    });
    customerId = customer.id;
    await saveStripeCustomerId(userId, customerId);
  }

  // Check for existing subscription → send to portal instead
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "active" });
  if (subs.data[0]) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });
    return NextResponse.json({ url: portal.url });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: getPriceId(), quantity: 1 }],
    success_url: `${origin}/account?success=true`,
    cancel_url: `${origin}/account?canceled=true`,
    metadata: { instantUserId: userId },
  });

  return NextResponse.json({ url: session.url });
}
```

## Handling webhooks

Stripe sends webhooks for subscription lifecycle events. We listen for three:

```ts
// src/app/api/stripe/webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.instantUserId;
      await adminDb.transact(
        adminDb.tx.$users[userId].update({
          subscriptionStatus: "active",
          cancelAt: null,
        })
      );
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const user = await findUserByStripeCustomerId(subscription.customer);
      await adminDb.transact(
        adminDb.tx.$users[user.id].update({
          subscriptionStatus: subscription.status,
          cancelAt: subscription.cancel_at,
        })
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const user = await findUserByStripeCustomerId(subscription.customer);
      await adminDb.transact(
        adminDb.tx.$users[user.id].update({
          subscriptionStatus: "canceled",
        })
      );
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

### Setting up webhook forwarding

For local development, use the Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login (one time)
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook signing secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET`.

For production, add the endpoint in [Stripe Dashboard](https://dashboard.stripe.com/webhooks):
- URL: `https://your-app.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

## Protecting content with permissions

Use field-level permissions to protect premium content:

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

This says: "Return `content` only if the post isn't premium OR the user has an active subscription."

Push permissions:

```bash
npx instant-cli push perms --yes
```

Query posts normally — permissions are automatic:

```tsx
const { data } = db.useQuery({ posts: {} });

// For subscribed users: post.content exists
// For unsubscribed users on premium posts: post.content is omitted
const isLocked = post.isPremium && !post.content;
```

## The sync strategy

Webhooks can be delayed. We sync Stripe data in multiple places to ensure consistency:

| Location | Why |
|----------|-----|
| Checkout route | Catch existing subs before creating duplicates |
| Success page | Beat the webhook race |
| Portal route | Sync before showing billing portal |
| Webhook | Backup for all Stripe events |

The success page sync:

```tsx
// src/app/account/page.tsx
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

The sync API verifies the token and derives the user ID server-side:

```ts
// src/app/api/stripe/sync/route.ts
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const user = await getUser(userId);

  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1,
  });

  const sub = subscriptions.data[0];
  await adminDb.transact(
    adminDb.tx.$users[userId].update({
      subscriptionStatus: sub?.status ?? null,
      cancelAt: sub?.cancel_at ?? null,
    })
  );

  return NextResponse.json({ synced: true });
}
```

## Adding the billing portal

The billing portal lets users manage their subscription (cancel, update payment, etc.):

```ts
// src/app/api/stripe/portal/route.ts
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const user = await getUser(userId);

  // Sync before opening portal
  await syncSubscriptionStatus(userId);

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/account`,
  });

  return NextResponse.json({ url: session.url });
}
```

## Testing your integration

### Test mode

Use Stripe's test cards:

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |

Any future expiry, any CVC, any ZIP.

### Testing subscription states

Manually set subscription status for testing:

```bash
source .env && pnpm tsx scripts/set-subscription.ts user@email.com active
source .env && pnpm tsx scripts/set-subscription.ts user@email.com canceled
```

### Production testing

1. Create a 100% off coupon in Stripe Dashboard (live mode)
2. Add `allow_promotion_codes: true` to your checkout session
3. Test with the coupon
4. Remove after testing

## Common Mistake: Not setting up the production webhook

Your webhook works locally with Stripe CLI, but you need to add it in the Stripe Dashboard for production.

## Fin

You now have a subscription system with:

- Stripe Checkout for payments
- Webhook handling for subscription lifecycle
- Auth-based access control via InstantDB permissions
- Billing portal for self-service management
- Multi-point sync for consistency

The best part? Access control happens server-side in InstantDB's permission rules. Even if someone inspects your client code, they can't bypass it.

For more features like trials, multiple tiers, or metered billing, check out the [Stripe Subscriptions docs](https://stripe.com/docs/billing/subscriptions/overview).
