# Subscription Flow

## User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Account Page (Not Signed In)                                   │
│  ┌─────────────────────────────────────────┐                   │
│  │  [Sign In]                              │                   │
│  │                                         │                   │
│  │  Enter email → Get code → Verify        │                   │
│  └─────────────────────────────────────────┘                   │
│                     │                                           │
│                     ▼                                           │
│  Account Page (Signed In, No Subscription)                      │
│  ┌─────────────────────────────────────────┐                   │
│  │  [Subscribe — $5/month]                 │                   │
│  │                                         │                   │
│  │  Unlock premium content                 │                   │
│  └─────────────────────────────────────────┘                   │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────┐                   │
│  │         Stripe Checkout                 │                   │
│  │    [Enter card details + Pay]           │                   │
│  └─────────────────────────────────────────┘                   │
│                     │                                           │
│         ┌──────────┴───────────┐                               │
│         ▼                      ▼                                │
│     Success                 Cancel                              │
│         │                      │                                │
│         ▼                      ▼                                │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │ Account Page │    │ Account Page │                          │
│  │              │    │ (can retry)  │                          │
│  │ ✓ Active!    │    └──────────────┘                          │
│  │ [Manage]     │                                              │
│  └──────────────┘                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Payment Flow

```
Client                      Stripe                      Server
  │                           │                           │
  │ 1. User clicks Subscribe  │                           │
  │                           │                           │
  │ 2. POST /api/stripe/checkout ────────────────────────▶│
  │    { userId }             │                           │
  │                           │                           │ 3. Get/create
  │                           │                           │    Stripe customer
  │                           │                           │
  │                           │◀─── Create session ───────│
  │                           │                           │
  │    ◀─────────────────── checkout URL ─────────────────│
  │                           │                           │
  │ 4. Redirect ─────────────▶│                           │
  │                           │                           │
  │                     5. User pays                      │
  │                           │                           │
  │                           │ 6. Webhook ──────────────▶│
  │                           │    (session.completed)    │
  │                           │                           │ 7. Update
  │                           │                           │    subscriptionStatus
  │    ◀── 8. Redirect ───────│                           │
  │        to /account?success│                           │
  │                           │                           │
  │ 9. POST /api/stripe/sync ────────────────────────────▶│ 10. Sync from
  │    (beat webhook race)    │                           │     Stripe
  │                           │                           │
  │ 11. Query posts ──────────────────────────────────────▶
  │     (with auth)           │                           │
  │                           │                           │
  │    ◀─────────────────── content returned ─────────────│
  │                           │                           │
  ▼                           ▼                           ▼
```

## Data Model

```
$users                                 posts
├── email                              ├── title
├── stripeCustomerId ───────┐          ├── teaser (public)
├── subscriptionStatus      │          ├── content (protected)
└── cancelAt                │          ├── isPremium
                            │          └── publishedAt
                            │
                            ▼
              ┌─────────────────────────┐
              │    Stripe Customer      │
              ├─────────────────────────┤
              │  subscriptions[]        │
              │    └── status           │
              │    └── cancel_at        │
              └─────────────────────────┘
```

## Access Control

```ts
// Permission rule for posts.content
bind: ["isSubscriber", "auth.subscriptionStatus == 'active'"]
fields: { content: "!data.isPremium || isSubscriber" }
```

- User logged in with active subscription → `content` returned → full article
- User not logged in or no subscription → `content` omitted → show paywall

## Subscription States

```
                              ┌─────────────────┐
                              │ No Subscription │
                              └────────┬────────┘
                                       │
                                       │ Subscribes
                                       ▼
                    Renews    ┌─────────────────┐
               ┌──────────────│     Active      │◀─────────────┐
               │              └────────┬────────┘              │
               │                       │                       │
               │          Cancels      │                       │ Resubscribes
               │       (end of period) │                       │
               │                       ▼                       │
               │              ┌─────────────────┐              │
               └──────────────│    Canceling    │              │
                              │ (cancelAt set)  │              │
                              └────────┬────────┘              │
                                       │                       │
                                       │ Period ends           │
                                       ▼                       │
                              ┌─────────────────┐              │
                              │    Canceled     │──────────────┘
                              └─────────────────┘
```

| State | subscriptionStatus | cancelAt | Access | UI |
|-------|-------------------|----------|--------|-----|
| Active | `active` | `null` | Yes | Green badge, "Manage" button |
| Canceling | `active` | timestamp | Yes | Yellow badge, "Ends on X" |
| Canceled | `canceled` | — | No | "Subscribe" button |

## Billing Portal Flow

```
Account Page
     │
     │ Click "Manage Billing"
     ▼
POST /api/stripe/portal
     │
     │ Sync subscription status first
     │ Create portal session
     ▼
Redirect to Stripe Portal
     │
     │ User can:
     │   • Update payment method
     │   • Cancel subscription
     │   • View invoices
     ▼
Return to /account
```

## Sync Points

```
                            ┌─────────────────┐
                            │   User Action   │
                            └────────┬────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │         Which action?          │
                    └────────────────────────────────┘
                       │         │         │         │
          ┌────────────┘         │         │         └────────────┐
          │                      │         │                      │
          ▼                      ▼         ▼                      ▼
   ┌─────────────┐    ┌─────────────┐ ┌─────────────┐    ┌─────────────┐
   │  Checkout   │    │   Portal    │ │   Success   │    │   Webhook   │
   │   Route     │    │   Route     │ │    Page     │    │   Handler   │
   └──────┬──────┘    └──────┬──────┘ └──────┬──────┘    └──────┬──────┘
          │                  │               │                  │
          │                  │               │                  │
          └──────────────────┴───────┬───────┴──────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   Sync from Stripe  │
                          │                     │
                          │  1. Fetch sub data  │
                          │  2. Update InstantDB│
                          └─────────────────────┘
```

Why sync everywhere?
- **Checkout route** — Catch existing subs before duplicates
- **Portal route** — Reflect changes made in portal
- **Success page** — Beat the webhook race
- **Webhook** — Catch everything else
