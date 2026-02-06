# Wallpaper Store

A reference implementation for adding Stripe payments to InstantDB apps.

Buy-once digital product with token-based access control — no user accounts required.

## Features

- Stripe Checkout integration
- Webhook-based purchase creation
- Field-level permissions for protected content
- Email-based purchase recovery via magic codes

## Docs

- `stripe-strategy.md` — The payment pattern explained
- `tutorial.md` — Step-by-step implementation guide
- `purchase.md` — How the purchase flow works

## Setup

```bash
pnpm install
cp .env.example .env.local  # Add your keys
npx instant-cli push schema
npx instant-cli push perms
npx tsx scripts/seed-wallpapers.ts  # Populate initial wallpapers
pnpm dev
```

## Scripts

```bash
pnpm dev                        # Start dev server
npx instant-cli push schema     # Push schema changes
npx instant-cli push perms      # Push permission changes
```
