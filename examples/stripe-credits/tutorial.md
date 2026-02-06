# Adding Usage-Based Credits to Your App

So you've built an app and want to charge per use? This tutorial walks through adding Stripe credit packs with InstantDB for balance tracking.

By the end, you'll have:
- Token-verified API routes that prevent user impersonation
- A purchase flow that adds credits to a user's account
- Idempotent webhook fulfillment
- A server-side API that deducts credits per use
- Real-time balance updates via InstantDB

Let's get started!

1. [How it works](#how-it-works)
1. [Setting up Stripe](#setting-up-stripe)
1. [Updating the schema](#updating-the-schema)
1. [Creating the checkout flow](#creating-the-checkout-flow)
1. [Handling webhooks](#handling-webhooks)
1. [Spending credits](#spending-credits)
1. [Protecting content with permissions](#protecting-content-with-permissions)
1. [Testing your integration](#testing-your-integration)
1. [Common mistakes](#common-mistakes)
1. [Fin](#fin)

## How it works

Before diving into code, let's understand the flow:

```
1. User signs in → Required for credit tracking
2. User clicks "Buy Credits" → Redirected to Stripe
3. User pays → Webhook adds credits to account
4. InstantDB real-time subscription → UI updates instantly
5. User generates haiku → Server deducts 1 credit
```

The key insight: credits live on the `$users` record. Stripe handles payment, our server handles the balance. The webhook uses Stripe session metadata to prevent double-crediting, and InstantDB's real-time subscriptions keep the UI in sync without any extra polling or sync endpoints.

## Setting up Stripe

First, create a Stripe account at [stripe.com](https://stripe.com) if you haven't already.

Install the Stripe SDK:

```bash
pnpm add stripe
```

### Create a credit pack product

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products) → Products
2. Click "Add product"
3. Name: "10 Credit Pack" (or whatever you like)
4. Pricing: $2.00, one-time
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

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export function getPriceId(): string {
  return process.env.STRIPE_PRICE_ID!;
}

export const CREDITS_PER_PACK = 10;
```

## Updating the schema

We store credits and the Stripe customer ID directly on the user, plus a `haikus` entity for generated content:

```ts
// instant.schema.ts
$users: i.entity({
  email: i.string().unique().indexed().optional(),
  credits: i.number().optional(),
  stripeCustomerId: i.string().optional(),
}),
haikus: i.entity({
  topic: i.string(),
  content: i.string(),
  createdAt: i.number().indexed(),
}),
```

Link haikus to their author:

```ts
links: {
  userHaikus: {
    forward: { on: "haikus", has: "one", label: "author", onDelete: "cascade" },
    reverse: { on: "$users", has: "many", label: "haikus" },
  },
},
```

Push your schema:

```bash
npx instant-cli push schema --yes
```

## Creating the checkout flow

The buy button calls our checkout API, sending the user's auth token so the server can verify their identity:

```tsx
async function handlePurchase() {
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

The checkout API route verifies the auth token, gets or creates a Stripe customer, and creates a one-time payment session:

```ts
// src/app/api/stripe/checkout/route.ts
export async function POST(request: NextRequest) {
  // Verify auth — userId comes from the token, not the request body
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  // Get user from InstantDB
  const { $users } = await adminDb.query({
    $users: { $: { where: { id: userId } } },
  });
  const user = $users[0];

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { instantUserId: userId },
    });
    customerId = customer.id;
    await adminDb.transact(
      adminDb.tx.$users[userId].update({ stripeCustomerId: customerId })
    );
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: getPriceId(), quantity: 1 }],
    success_url: `${origin}/?success=true`,
    cancel_url: `${origin}/?canceled=true`,
    metadata: { instantUserId: userId },
  });

  return NextResponse.json({ url: session.url });
}
```

## Handling webhooks

When payment completes, Stripe sends a `checkout.session.completed` event. We add credits to the user:

```ts
// src/app/api/stripe/webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  const event = stripe.webhooks.constructEvent(
    body, signature, process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case "checkout.session.completed": {
      // Re-fetch session for live metadata — the event payload is frozen
      // at creation time, so retries would always bypass the idempotency check
      const session = await stripe.checkout.sessions.retrieve(
        event.data.object.id
      );

      if (session.payment_status !== "paid") break;

      // Idempotency check
      if (session.metadata?.creditsProcessed === "true") break;

      const userId = session.metadata?.instantUserId;
      if (!userId) break;

      // Mark as processed
      await stripe.checkout.sessions.update(session.id, {
        metadata: { ...session.metadata, creditsProcessed: "true" },
      });

      // Add credits
      const { $users } = await adminDb.query({
        $users: { $: { where: { id: userId } } },
      });
      await adminDb.transact(
        adminDb.tx.$users[userId].update({
          credits: ($users[0]?.credits || 0) + CREDITS_PER_PACK,
        })
      );
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

**Important:** We re-fetch the session from Stripe rather than using `event.data.object` directly. The event payload's metadata is frozen at creation time — if Stripe retries the webhook, the payload still has the original metadata (without `creditsProcessed`), so the idempotency check would always pass. Re-fetching gives us the live metadata.

Once credits are written, InstantDB's real-time subscriptions push the update to the client immediately — no separate sync endpoint needed.

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
- Events: just `checkout.session.completed`

Unlike subscriptions which need multiple events for lifecycle changes, credit packs only need this single event — it fires when a one-time payment completes.

## Spending credits

The generate API verifies the caller's identity, checks the balance, deducts a credit, and creates the content in a single transaction:

```ts
// src/app/api/generate/route.ts
export async function POST(request: NextRequest) {
  // Verify auth — userId comes from the token, not the request body
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const { topic } = await request.json();

  const { $users } = await adminDb.query({
    $users: { $: { where: { id: userId } } },
  });
  const user = $users[0];

  const currentCredits = user.credits || 0;
  if (currentCredits < 1) {
    return NextResponse.json(
      { error: "Insufficient credits", needsCredits: true },
      { status: 402 }
    );
  }

  const content = generateHaiku(topic);
  const haikuId = id();

  // Deduct credit and create haiku atomically
  await adminDb.transact([
    adminDb.tx.$users[userId].update({ credits: currentCredits - 1 }),
    adminDb.tx.haikus[haikuId]
      .update({ topic, content, createdAt: Date.now() })
      .link({ author: userId }),
  ]);

  return NextResponse.json({ haiku: { id: haikuId, topic, content } });
}
```

The user ID comes from the verified auth token — not from the request body. Clients can't impersonate other users or manipulate their balance.

The client handles a `402` response by opening the purchase modal:

```tsx
const data = await res.json();
if (data.needsCredits) {
  onNeedCredits(); // opens purchase modal
  return;
}
```

## Protecting content with permissions

Haikus are scoped to their author:

```ts
// instant.perms.ts
const rules = {
  haikus: {
    allow: {
      view: "isAuthor",
      create: "false",  // Created via admin SDK
      delete: "isAuthor",
    },
    bind: ["isAuthor", "auth.id in data.ref('author.id')"],
  },
};
```

Query normally — permissions are automatic:

```tsx
const { data } = db.useQuery({
  haikus: { $: { order: { createdAt: "desc" } } },
});
```

Each user only sees their own haikus. The permission enforcement happens server-side in InstantDB.

Push permissions:

```bash
npx instant-cli push perms --yes
```

## Testing your integration

### Test mode

Use Stripe's test cards:

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |

Any future expiry, any CVC, any ZIP.

### Testing credit flow

1. Sign in, buy a credit pack
2. Generate haikus until credits run out
3. Verify the "no credits" prompt appears
4. Buy another pack, verify credits stack

### Production testing

To test your live deployment without spending real money:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/coupons) → Coupons (in live mode)
2. Create a coupon: 100% off, one-time use
3. Give it a memorable code like `TESTING100`
4. Deploy your app and go through checkout
5. Enter the coupon code on the Stripe checkout page — the total drops to $0
6. Complete the purchase — your webhook fires and credits are added, no charge

This works because the checkout session has `allow_promotion_codes: true`:

```ts
const session = await stripe.checkout.sessions.create({
  // ...
  allow_promotion_codes: true,
});
```

Clean up after testing:
- Delete or deactivate the coupon in the Stripe Dashboard
- Optionally reset the test user's credits via the InstantDB admin SDK

## Common mistakes

### 1. Webhook secret mismatch

Every time you restart `stripe listen`, it prints a new `whsec_...` secret. You must update `STRIPE_WEBHOOK_SECRET` and restart your dev server.

### 2. Not handling duplicate webhooks

Stripe may send the same event multiple times. Always use an idempotency mechanism:

```ts
// BAD - Credits added twice!
await addCredits(userId, CREDITS_PER_PACK);

// GOOD - Check the flag first
if (session.metadata?.creditsProcessed === "true") break;
await stripe.checkout.sessions.update(session.id, {
  metadata: { ...session.metadata, creditsProcessed: "true" },
});
await addCredits(userId, CREDITS_PER_PACK);
```

### 3. Trusting client-provided user IDs

Never take the user ID from the request body — anyone can send any ID. Use `verifyAuth` to derive the user ID from a verified token:

```ts
// BAD - Anyone can impersonate any user
const { userId } = await request.json();

// GOOD - User ID comes from verified auth token
const auth = await verifyAuth(request);
if (auth.error) return auth.error;
const userId = auth.user.id;
```

### 4. Client-side credit enforcement only

Never trust the client to enforce credit limits:

```ts
// BAD - Client checks credits, server blindly generates
if (credits > 0) callGenerateApi();

// GOOD - Server checks and deducts
const currentCredits = user.credits || 0;
if (currentCredits < 1) return 402;
```

### 5. Not setting up the production webhook

Your webhook works locally with `stripe listen`, but you need to add it in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks) for production. Add `https://your-app.com/api/stripe/webhook` and select only `checkout.session.completed`.

## Fin

You now have a usage-based payment system with:

- Token-verified API routes (no user impersonation)
- Stripe Checkout for credit packs
- Idempotent webhook fulfillment (re-fetches session for correct retry handling)
- Server-side credit deduction via InstantDB admin SDK
- Real-time balance updates via InstantDB subscriptions
- Author-scoped content via permissions

The best part? Auth verification, credit enforcement, and content permissions all happen server-side. Even if someone inspects your client code, they can't bypass it.

For more Stripe features like tiered pricing, volume discounts, or metered billing, check out the [Stripe docs](https://stripe.com/docs).
