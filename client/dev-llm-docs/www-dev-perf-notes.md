# `client/www` dev perf notes

## Benchmark

Command:

```bash
cd client
pnpm run bench:www-dev -- --slot 8
```

What it measures:

- Boots the same client dev stack as `make dev`, but uses Turbo's stream UI so logs are machine-readable.
- Deletes `client/www/.next` first so comparisons across commits start from the same cache state.
- Waits for `instant-www` to report ready.
- Measures the first and second HTML requests for `/` and `/about`.
- Captures Next's `GET ... in ...` timings from `instant-www`.

## Baseline

Date: 2026-04-02

Cold results:

- `/`: `GET / 200 in 7920ms`
- `/about`: `GET /about 200 in 2929ms`

Warm results:

- `/`: `GET / 200 in 339ms`
- `/about`: `GET /about 200 in 117ms`

## Current theory

- `app/providers.tsx` imports `@/components/ui`, which pulls the full `@instantdb/components` UI barrel into every app route.
- `components/marketingUi.tsx` does the same for the landing pages.
- `@instantdb/components` currently funnels through `packages/components/src/components/ui.tsx`, which eagerly imports Monaco, Prism, Sonner, Radix, Headless UI, and other non-marketing code.
