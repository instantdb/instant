<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/resumable-stream</h1>
</p>

<p align="center">
  <a
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" alt="Discord members" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/start-vanilla">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/start-vanilla">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
</p>

Welcome to [Instant's](http://instantdb.com) resumable-stream library.

This is a drop-in replacement for Vercel's resumable-stream library using InstantDB streams.

Instant's streams have no dependency on Redis and they never expire.

## Usage

You can provide your `appId` and `adminToken` as arguments to `createResumableStreamContext` or export `INSTANT_APP_ID` and `INSTANT_APP_ADMIN_TOKEN`.

### Idempotent API

```typescript
import { createResumableStreamContext } from '@instantdb/resumable-stream';
import { after } from 'next/server';

const streamContext = createResumableStreamContext({
  waitUntil: after,
  appId: YOUR_INSTANT_APP_ID, // or export INSTANT_APP_ID
  adminToken: YOUR_INSTANT_APP_ADMIN_TOKEN, // or export INSTANT_APP_ADMIN_TOKEN
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await params;
  const resumeAt = req.nextUrl.searchParams.get('resumeAt');
  const stream = await streamContext.resumableStream(
    streamId,
    makeTestStream,
    resumeAt ? parseInt(resumeAt) : undefined,
  );
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}
```

### Usage with explicit resumption

```typescript
import { createResumableStreamContext } from '@instantdb/resumable-stream';
import { after } from 'next/server';

const streamContext = createResumableStreamContext({
  waitUntil: after,
  appId: YOUR_INSTANT_APP_ID, // or export INSTANT_APP_ID
  adminToken: YOUR_INSTANT_APP_ADMIN_TOKEN, // or export INSTANT_APP_ADMIN_TOKEN
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await params;
  const stream = await streamContext.createNewResumableStream(
    streamId,
    makeTestStream,
  );
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await params;
  const resumeAt = req.nextUrl.searchParams.get('resumeAt');
  const stream = await streamContext.resumeExistingStream(
    streamId,
    resumeAt ? parseInt(resumeAt) : undefined,
  );
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}
```

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
