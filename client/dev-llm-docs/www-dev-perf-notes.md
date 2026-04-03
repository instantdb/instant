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

## Server TTFB profiler

Command:

```bash
cd client
pnpm run profile:www-server -- --slot 8 --route /
```

What it measures:

- Boots `client/www` directly under the Node inspector
- Clears `client/www/.next` first so the request is cold
- Captures a CPU profile for the actual `next-server` process during the first HTML response
- Writes a `.cpuprofile` plus a JSON summary to `client/dev-llm-docs/server-profiles`

Key findings on webpack:

- The cold `/` request spent most of its time in webpack, `acorn`, Tailwind/PostCSS, and `eval-source-map-dev-tool-plugin`
- Browser-side execution was not the primary problem
- This is what justified testing Tailwind and the Markdoc/Turbopack path next

## Change 2: scope docs Tailwind CSS to docs routes

What changed:

- Moved `styles/docs/tailwind.css` out of the root app layout
- Imported that stylesheet only from `app/docs/layout.tsx`
- Added a development fallback for GitHub stars so local cold loads do not depend on rate-limited GitHub API calls

Result:

- Direct `client/www` cold `/about` moved from about `2246ms` to about `2090ms`
- Direct `client/www` cold `/` moved from about `5980ms` into a `5684ms` to `5936ms` range
- Decision: keep it because the CSS split is correct structurally and the `/about` win is real, even though it is not the breakthrough fix

## Change 3: upgrade Markdoc + Next and switch `instant-www` to Turbopack

What changed:

- Upgraded `@markdoc/next.js` from `0.3.7` to `0.5.0`
- Upgraded `next` from `15.5.7` to `16.2.2`
- Enabled Turbopack in `client/www`
- Updated the Markdoc config to `withMarkdoc({ dir: process.cwd() })`

Why:

- The old `@markdoc/next.js` package was webpack-only
- The upstream Markdoc package added Turbopack support in `0.5.0`
- On `next@15.5.7`, docs routes were still unstable under Turbopack with an app-build-manifest ENOENT
- On `next@16.2.2`, `/` and `/docs/init` were stable in repeated direct smoke tests

Result (full root benchmark, clean `.next` cache):

- Prior committed baseline after shared UI entrypoint split: `/` `6287ms`, `/about` `2122ms`
- Turbopack run 1: `/` `5461ms`, `/about` `582ms`
- Turbopack run 2: `/` `5235ms`, `/about` `518ms`
- Improvement on `/`: about `826ms` to `1052ms` faster (`13%` to `17%`)
- Improvement on `/about`: about `1540ms` to `1604ms` faster (`73%` to `76%`)

Direct `client/www` smoke test under `next dev --turbopack`:

- Server ready in `282ms`
- Cold `/`: about `2933ms`
- Cold `/docs/init`: about `840ms`
- Warm `/docs/init`: about `30ms`

## More reverted experiments

- Upgraded `tailwindcss` and `@tailwindcss/postcss` to `4.2.2`
- Result: no material improvement in cold route timings
- Decision: reverted

- Switched homepage hero Mux video to a client-only `next/dynamic(..., { ssr: false })` boundary
- Result: cold `/` stayed in the same `5.2s` to `5.5s` range and was slightly worse on the measured run
- Decision: reverted

- Switched Motion imports to the reduced bundle-size pattern from the Motion docs
- Result: no material server-side TTFB improvement
- Decision: reverted
