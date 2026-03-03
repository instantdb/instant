# AI Chat

A multi-conversation chat app built with the Vercel AI SDK and InstantDB Streams.

## Features

- Streams AI responses to the browser via InstantDB streams
- Resumes in-progress streams on page reload (no lost responses)
- Persists chat history and messages in InstantDB
- Multi-conversation support with a sidebar
- Works out of the box with a mock Wikipedia model (no API key needed)

## Setup

```bash
pnpm install
npx instant-cli push
pnpm dev
```

## Environment variables

| Variable                     | Required | Description                                                      |
| ---------------------------- | -------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_INSTANT_APP_ID` | yes      | InstantDB app ID                                                 |
| `INSTANT_APP_ADMIN_TOKEN`    | yes      | InstantDB admin token for server-side operations                 |
| `ANTHROPIC_API_KEY`          | no       | Anthropic API key (preferred). Falls back to mock model if unset |
| `OPENAI_API_KEY`             | no       | OpenAI API key. Falls back to mock model if unset                |

## Scripts

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm start      # Start production server
pnpm typecheck  # Type-check without emitting
pnpm format     # Format with Prettier
```
