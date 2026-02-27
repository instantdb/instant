# Vercel AI SDK App Builder

A simple single-shot app builder that takes one prompt and creates a single-page app.

## Features

- Streams AI-generated code to the browser via InstantDB streams
- Renders generated code in a sandboxed iframe preview
- Persists chat history in InstantDB with guest auth
- Provisions ephemeral Instant apps for preview execution
- Works out of the box with pre-generated responses (no API key needed)

## Setup

```bash
pnpm install
npx instant-cli push
pnpm dev
```

## Environment variables

| Variable                     | Required | Description                                                    |
| ---------------------------- | -------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_INSTANT_APP_ID` | yes      | InstantDB app ID for chat history + guest auth                 |
| `INSTANT_APP_ADMIN_TOKEN`    | yes      | InstantDB admin token for server-side operations               |
| `OPENAI_API_KEY`             | no       | OpenAI API key. Falls back to pre-generated responses if unset |
| `ANTHROPIC_API_KEY`          | no       | Anthropic API key. Used when `AI_MODEL` starts with `claude`   |
| `AI_MODEL`                   | no       | Model ID, defaults to `gpt-5-codex`                            |

## Scripts

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm start      # Start production server
pnpm lint       # Run linter
pnpm typecheck  # Type-check without emitting
```

## Deploying to production

In production, the generated apps will run on a unique subdomain. Make sure you have a wildcard cert for your domain (on Vercel, use the DNS option to validate your domain).
