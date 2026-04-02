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

## Change 1: split shared component entrypoints

What changed:

- Moved the real `Button`, `cn`, `LogoIcon`, and tooltip exports out of `packages/components/src/components/ui.tsx` into separate package entry files.
- Added package subpath exports for those files.
- Updated `/`, `/about`, `app/providers.tsx`, and `marketingUi.tsx` to import those real subpaths instead of the `www` UI barrel.
- Split shadow-root context out of `StyleMe` so tooltip imports no longer drag explorer context into `/about`.

Result (clean `.next` cache):

- `/`: `7920ms` → `6287ms` (`-1633ms`, about `-20.6%`)
- `/about`: `2929ms` → `2122ms` (`-807ms`, about `-27.6%`)

## Chrome trace script

Command:

```bash
cd client
pnpm run trace:www-dev -- --slot 8 --route /
pnpm run trace:www-dev -- --slot 8 --route /about
```

Outputs:

- Raw Chrome trace JSON in `client/dev-llm-docs/traces`
- JSON summary with document timing, `Performance.getMetrics()` output, top requests, and top main-thread event durations

Key findings:

- `/`: document request `ttfbMs` is about `6036ms`, while browser `ScriptDurationMs` is about `215ms`
- `/about`: document request `ttfbMs` is about `4839ms`, while browser `ScriptDurationMs` is about `161ms`
- The remaining bottleneck is mostly server-side route compile time, not browser execution time
- The homepage also starts several media requests and an `active_sessions` API call during boot, but those are secondary to the HTML TTFB

## Reverted experiment

- Deferred `@mux/mux-player-react` behind a click-triggered `import()`
- Result: homepage cold compile only moved by about `300ms`
- Decision: reverted because the win was not meaningful enough
