# Credit Flow

## User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Home Page (Not Signed In)                                      │
│  ┌─────────────────────────────────────────┐                   │
│  │  [Sign In]                              │                   │
│  │                                         │                   │
│  │  Enter email → Get code → Verify        │                   │
│  └─────────────────────────────────────────┘                   │
│                     │                                           │
│                     ▼                                           │
│  Home Page (Signed In, 0 Credits)                               │
│  ┌─────────────────────────────────────────┐                   │
│  │  [Buy Credits]                          │                   │
│  │                                         │                   │
│  │  10 credits for $2.00                   │                   │
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
│  │ Home Page    │    │  Home Page   │                          │
│  │              │    │  (can retry) │                          │
│  │ +10 credits! │    └──────────────┘                          │
│  │ [Generate]   │                                              │
│  └──────────────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │ Enter topic  │                                              │
│  │ [Generate]   │──▶ -1 credit, haiku created                  │
│  │              │                                              │
│  │ History      │                                              │
│  └──────────────┘                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Payment Flow

```
Client                      Stripe                      Server
  │                           │                           │
  │ 1. User clicks            │                           │
  │    "Buy Credits"          │                           │
  │                           │                           │
  │ 2. POST /api/stripe/checkout ───────────────────────▶│
  │    Authorization: Bearer  │                           │
  │                           │                           │ 3. Verify token,
  │                           │                           │    get/create
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
  │                           │                           │ 7. Re-fetch session,
  │    ◀── 8. Redirect ───────│                           │    check idempotency
  │        to /?success=true  │                           │    flag, add credits
  │                           │                           │
  │ 9. Credits updated ◀───── real-time subscription ─────│
  │                           │                           │
  ▼                           ▼                           ▼
```

## Credit Spend Flow

```
Client                                               Server
  │                                                     │
  │ 1. POST /api/generate ─────────────────────────────▶│
  │    Authorization: Bearer  │                          │
  │    { topic }              │                          │ 2. Verify token,
  │                                                     │    check credits
  │                                                     │    (credits < 1 → 402)
  │                                                     │
  │                                                     │ 3. Generate haiku
  │                                                     │
  │                                                     │ 4. Transact:
  │                                                     │    - credits - 1
  │                                                     │    - create haiku
  │                                                     │    - link to user
  │                                                     │
  │    ◀─────────────────── { haiku } ──────────────────│
  │                                                     │
  │ 5. Balance + history ◀── real-time subscription ────│
  │    update automatically                             │
  │                                                     │
  ▼                                                     ▼
```

## Data Model

```
$users                                 haikus
├── email                              ├── topic
├── credits ◄──── balance              ├── content
├── stripeCustomerId ───────┐          └── createdAt
│                           │
│   userHaikus link         │          author ◄──── one user
│   └── $users.haikus ◄──▶ haikus.author
│                           │
│                           ▼
│             ┌─────────────────────────┐
│             │    Stripe Customer      │
│             ├─────────────────────────┤
│             │  checkout sessions[]    │
│             │    └── metadata         │
│             │       └── instantUserId │
│             └─────────────────────────┘
```

## Access Control

```ts
// Permission rule for haikus
allow: { view: "isAuthor", delete: "isAuthor" }
bind: ["isAuthor", "auth.id in data.ref('author.id')"]
```

- Auth token verified on all API routes → no user impersonation
- Signed-in user → sees only their own haikus
- Credit check + deduction happens server-side → can't be bypassed

## Idempotency

```
                  ┌──────────────────────┐
                  │  Payment completes   │
                  └──────────┬───────────┘
                             │
                             ▼
                      ┌────────────┐
                      │  Webhook   │
                      └──────┬─────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  Re-fetch session   │
                  │  from Stripe API    │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  creditsProcessed   │
                  │  == "true"?         │
                  └──────────┬──────────┘
                             │
                     ┌───────┴───────┐
                     │               │
                     ▼               ▼
                  Yes: skip      No: set flag,
                                 add credits
```

The webhook re-fetches the session from Stripe (rather than using the event payload, which is frozen at creation time). This ensures the `creditsProcessed` flag is checked against live metadata, so retried webhooks correctly skip if credits were already added.
