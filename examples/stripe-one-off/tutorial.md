# Adding Payments to Your App

So you've built a beautiful wallpaper app and now you want to charge for it? Great choice! This tutorial walks through adding Stripe payments with InstantDB for access control.

By the end, you'll have:
- A "Buy" button that creates a Stripe checkout session
- A webhook that creates purchase records when payments complete
- Token-based access control for protected content
- A recovery flow for users who lose access

Let's get started!

1. [How it works](#how-it-works)
1. [Setting up Stripe](#setting-up-stripe)
1. [Updating the schema](#updating-the-schema)
1. [Creating the checkout flow](#creating-the-checkout-flow)
1. [Handling the webhook](#handling-the-webhook)
1. [Protecting content with permissions](#protecting-content-with-permissions)
1. [Building the success page](#building-the-success-page)
1. [Adding purchase recovery](#adding-purchase-recovery)
1. [Testing your integration](#testing-your-integration)
1. [Common mistakes](#common-mistakes)
1. [Fin](#fin)

## How it works

Before diving into code, let's understand the flow:

```
1. User clicks "Buy" → Token generated and saved to localStorage
2. User redirected to Stripe checkout
3. User pays → Stripe sends webhook to your server
4. Webhook creates purchase record linked to all wallpapers
5. User redirected to success page → Token in localStorage unlocks content
```

The key insight: we generate the token *before* checkout and pass it to Stripe as metadata. When the webhook fires, it reads that token and creates the purchase record. This means the success page already has the token — no extra API calls needed!

## Setting up Stripe

First, create a Stripe account at [stripe.com](https://stripe.com) if you haven't already.

Install the Stripe SDK:

```bash
pnpm add stripe
```

Grab your API keys from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys) and add them to `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # We'll get this shortly
```

Create a Stripe client:

<file label="src/lib/stripe.ts"></file>

```ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

> **Note:** Never expose your secret key to the client. It should only be used in server-side code (API routes, webhooks).

## Updating the schema

We need a `purchases` entity to track who bought what. Each purchase has a `token` that proves ownership.

<file label="instant.schema.ts"></file>

```ts
const _schema = i.schema({
  entities: {
    // ... existing entities
    purchases: i.entity({
      token: i.string().unique().indexed(),
      email: i.string().indexed(),
      stripeSessionId: i.string().unique().indexed(),
      stripePaymentIntentId: i.string().optional(),
      amount: i.number(),
      currency: i.string(),
      status: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    // ... existing links
    purchaseWallpapers: {
      forward: { on: "purchases", has: "many", label: "wallpapers" },
      reverse: { on: "wallpapers", has: "many", label: "purchases" },
    },
  },
});
```

Push your schema:

```bash
npx instant-cli push schema --yes
```

The `token` field is the magic — it's a UUID that lives in the user's localStorage and proves they purchased the content.

## Creating the checkout flow

The buy button does three things:
1. Generates a unique token
2. Saves it to localStorage (so it's available after checkout)
3. Sends it to our checkout API

<file label="src/components/BuyButton.tsx"></file>

```tsx
"use client";

import { useState } from "react";
import { TOKEN_KEY } from "@/lib/constants";

export function BuyButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleBuy = async () => {
    setIsLoading(true);
    try {
      // Generate token BEFORE checkout and save to localStorage
      const token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleBuy} disabled={isLoading}>
      {isLoading ? "Processing..." : "Buy Full Pack — $5"}
    </button>
  );
}
```

> **Why generate the token before checkout?** This eliminates race conditions. The token exists before payment, so when the webhook fires, it just "activates" it by creating the purchase record. The success page already has the token in localStorage — no waiting, no extra API calls.

Now the checkout API route:

<file label="src/app/api/checkout/route.ts"></file>

```ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Premium Wallpaper Pack",
              description: "9 high-resolution wallpapers",
            },
            unit_amount: 500, // $5.00 in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success`,
      cancel_url: `${origin}`,
      metadata: { token }, // Pass token to webhook via metadata!
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

The key line is `metadata: { token }` — this passes our token to Stripe so the webhook can read it later.

## Handling the webhook

When payment completes, Stripe sends a webhook to your server. This is where we create the purchase record.

<file label="src/app/api/webhook/stripe/route.ts"></file>

```ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { createPurchase, findPurchaseBySessionId } from "@/lib/purchases";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event;

  // Verify the webhook signature
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const token = session.metadata?.token;

    if (!token) {
      console.error("No token in session metadata");
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Check for duplicate (idempotency)
    const existing = await findPurchaseBySessionId(session.id);
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Create the purchase record
    await createPurchase({
      token,
      email: session.customer_details?.email || "",
      stripeSessionId: session.id,
      stripePaymentIntentId: (session.payment_intent as string) || "",
      amount: session.amount_total || 500,
      currency: session.currency || "usd",
    });
  }

  return NextResponse.json({ received: true });
}
```

> **Always verify the webhook signature!** Without this, anyone could fake a webhook and get free access. The signature proves the request came from Stripe.

The `createPurchase` function creates the record and links it to all wallpapers:

<file label="src/lib/purchases.ts"></file>

```ts
import { adminDb } from "./adminDb";
import { id } from "@instantdb/admin";

export async function createPurchase(params: CreatePurchaseParams) {
  // Get all wallpapers to link to the purchase
  const { wallpapers } = await adminDb.query({ wallpapers: {} });
  const wallpaperIds = wallpapers.map((w) => w.id);

  const purchaseId = id();

  await adminDb.transact(
    adminDb.tx.purchases[purchaseId]
      .update({
        token: params.token,
        email: params.email,
        stripeSessionId: params.stripeSessionId,
        // ... other fields
        status: "completed",
        createdAt: Date.now(),
      })
      .link({ wallpapers: wallpaperIds })
  );

  return params.token;
}
```

### Setting up the webhook endpoint

For local development, use the Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login (one time)
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

This outputs a webhook signing secret (`whsec_...`) — add it to your `.env.local`.

For production, add the webhook endpoint in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks):
- URL: `https://your-app.com/api/webhook/stripe`
- Events: `checkout.session.completed`

## Protecting content with permissions

Now the fun part — using InstantDB permissions to protect content. We use field-level permissions to hide `fullResUrl` unless the user has a valid token.

<file label="instant.perms.ts"></file>

```ts
const rules = {
  wallpapers: {
    allow: {
      view: "true", // Everyone can see wallpapers
      create: "false",
      update: "false",
      delete: "false",
    },
    fields: {
      // Only return fullResUrl if token matches a linked purchase
      fullResUrl: "ruleParams.token in data.ref('purchases.token')",
    },
  },
  purchases: {
    allow: {
      // Viewable if authenticated user's email matches
      view: "data.email == auth.email",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
};
```

The magic is in this line:

```ts
fullResUrl: "ruleParams.token in data.ref('purchases.token')"
```

This says: "Only return `fullResUrl` if the provided token exists in any purchase linked to this wallpaper."

Push your permissions:

```bash
npx instant-cli push perms --yes
```

Now when querying wallpapers, pass the token via `ruleParams`:

```tsx
const { data } = db.useQuery(
  { wallpapers: { $: { order: { order: "asc" } } } },
  token ? { ruleParams: { token } } : undefined
);

// If token is valid, wallpaper.fullResUrl exists
// If token is invalid or missing, fullResUrl is omitted
const isUnlocked = !!wallpaper.fullResUrl;
```

This is the beauty of InstantDB permissions — the access control happens server-side. Even if someone inspects your client code, they can't bypass it.

## Building the success page

The success page reads the token from localStorage (saved before checkout) and displays the unlocked content:

<file label="src/app/success/page.tsx"></file>

```tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { TOKEN_KEY } from "@/lib/constants";

export default function SuccessPage() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    setToken(savedToken);
    setIsLoading(false);
  }, []);

  // Query wallpapers with token
  const { data, isLoading: queryLoading } = db.useQuery(
    { wallpapers: { $: { order: { order: "asc" } } } },
    token ? { ruleParams: { token } } : undefined
  );

  if (isLoading || queryLoading) {
    return <div>Loading...</div>;
  }

  if (!token) {
    return <div>No purchase found</div>;
  }

  return (
    <div>
      <h1>Thank you for your purchase!</h1>
      {/* Render wallpapers - fullResUrl will be available */}
    </div>
  );
}
```

## Adding purchase recovery

What if a user clears their localStorage or switches devices? They need a way to recover their purchase. We use InstantDB's magic code auth to verify email ownership:

<file label="src/app/recover/page.tsx"></file>

```tsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { TOKEN_KEY } from "@/lib/constants";

export default function RecoverPage() {
  const { user } = db.useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");

  // Once authenticated, query purchases by email
  const { data } = db.useQuery(user ? { purchases: {} } : null);

  useEffect(() => {
    if (data?.purchases?.[0]) {
      // Found a purchase - save token and sign out
      localStorage.setItem(TOKEN_KEY, data.purchases[0].token);
      db.auth.signOut();
      setStep("done");
    }
  }, [data]);

  const handleSendCode = async () => {
    await db.auth.sendMagicCode({ email });
    setStep("code");
  };

  const handleVerifyCode = async () => {
    await db.auth.signInWithMagicCode({ email, code });
    // Auth triggers the useQuery above
  };

  // ... render forms based on step
}
```

The permission rule `view: "data.email == auth.email"` allows authenticated users to see purchases matching their email. Once we find the purchase, we save the token and sign out — we only needed auth temporarily to verify email ownership.

## Testing your integration

### Test mode (free)

Use Stripe's test mode with test cards:

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |

Any future expiry date, any 3-digit CVC, any ZIP code.

### Production testing

To test your actual production setup without fees:

1. Create a 100% off coupon in Stripe Dashboard (live mode)
2. Add `allow_promotion_codes: true` to your checkout session
3. Use the coupon during checkout
4. Remove the line after testing

## Common mistakes

### 1. Forgetting to verify webhook signatures

```ts
// BAD - Anyone can fake webhooks!
const event = JSON.parse(body);

// GOOD - Verifies request came from Stripe
const event = stripe.webhooks.constructEvent(body, signature, secret);
```

### 2. Not handling duplicate webhooks

Stripe may send the same webhook multiple times. Always check for existing records:

```ts
const existing = await findPurchaseBySessionId(session.id);
if (existing) {
  return NextResponse.json({ received: true, duplicate: true });
}
```

### 3. Trusting localStorage alone

Don't show "purchased" UI just because a token exists in localStorage:

```ts
// BAD - Token might be invalid (user cancelled checkout)
const hasPurchase = !!localStorage.getItem(TOKEN_KEY);

// GOOD - Check if token actually grants access
const hasPurchase = wallpapers.some((w) => !!w.fullResUrl);
```

### 4. Generating tokens after checkout

If you generate tokens after checkout, you'll have race conditions between the webhook and success page. Generate the token *before* checkout:

```ts
// In BuyButton, BEFORE redirecting to Stripe
const token = crypto.randomUUID();
localStorage.setItem(TOKEN_KEY, token);

// Pass to checkout API
fetch("/api/checkout", { body: JSON.stringify({ token }) });
```

### 5. Not setting up the production webhook

Your webhook works locally with Stripe CLI, but you need to add it in the Stripe Dashboard for production. Go to Developers → Webhooks → Add endpoint.

### 6. Exposing the Stripe secret key

The secret key (`sk_...`) should only be used server-side. Never import it in client components:

```ts
// BAD - This exposes your key!
"use client";
import { stripe } from "@/lib/stripe";

// GOOD - Only use in API routes/server components
// src/app/api/checkout/route.ts
import { stripe } from "@/lib/stripe";
```

## Fin

And that's it! You now have a fully functional payment system with:

- Stripe checkout for payments
- Webhook handling for purchase creation
- Token-based access control via InstantDB permissions
- Email-based purchase recovery

The best part? The access control happens server-side in InstantDB's permission rules. No amount of client-side trickery can bypass it.

For more advanced features like subscriptions, multiple products, or usage-based billing, check out the [Stripe documentation](https://stripe.com/docs). Happy selling!
