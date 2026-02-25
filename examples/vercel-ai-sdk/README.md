# Vercel AI SDK App Builder

An app builder that streams generated React code to the browser using Next.js, Vercel AI SDK, and InstantDB streams.

## Features

- Streams AI-generated code to the browser via InstantDB streams
- Renders generated code in a sandboxed iframe preview
- Persists chat history in InstantDB with guest auth
- Provisions ephemeral Instant apps for preview execution
- Supports follow-up prompts with the latest code as context
- Works out of the box with pre-generated responses (no API key needed)

## Setup

```bash
pnpm install
cp .env.example .env.local  # Add your keys
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
| `AI_MODEL`                   | no       | Model ID, defaults to `gpt-4o`                                 |
| `INSTANT_API_URI`            | no       | Defaults to `https://api.instantdb.com`                        |

## Scripts

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm start      # Start production server
pnpm lint       # Run linter
pnpm typecheck  # Type-check without emitting
```
