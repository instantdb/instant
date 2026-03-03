---
title: Streams
description: How to stream and persist data with Instant.
---

Instant Streams provide a simple way to build durable, real-time data flows. They are excellent for LLM-native applications, making it easy to stream AI chat completions.

## How Streams work

Instant streams implement the standard [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API). When you create a write stream, the most recent data is buffered in memory on Instant's servers. The stream is periodically flushed to [Storage](/docs/storage) and is fully flushed to storage when finished.

Because streams are backed by storage, they never expire. A reader can pick up from any point in the stream, and resume if the connection is lost.

## Streams client SDK

### Creating a Write Stream

Use `const stream = db.streams.createWriteStream({ clientId })` to create a new writable stream.

- `clientId`: A unique ID for your stream. If the `clientId` is already taken, the stream will enter an error state and `await stream.streamId()` will throw an error. There can only be one writer per `clientId`.

```javascript {% showCopy=true %}
const stream = db.streams.createWriteStream({ clientId: 'my-unique-stream' });
const writer = stream.getWriter();

writer.write('First chunk\n');
writer.write('Second chunk\n');

// Get the persistent ID of the stream
const streamId = await stream.streamId();

await writer.close();
```

### Creating a Read Stream

Use `db.streams.createReadStream({ clientId })` or `db.streams.createReadStream({ streamId })` to read from a stream.

- `clientId`: Find the stream by the client-provided ID.
- `streamId`: Find the stream by its persistent Instant ID.
- `byteOffset`: Optionally start reading from a specific offset.

If the stream does not exist, the stream will enter an error state and return an error from `read()`.

```javascript {% showCopy=true %}
const stream = db.streams.createReadStream({ clientId: 'my-unique-stream' });
const reader = stream.getReader();

try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    console.log('Received:', value);
  }
} catch (error) {
  console.error('Error reading stream:', error);
} finally {
  reader.releaseLock();
}
```

### Querying Stream Metadata

You can retrieve stream metadata by querying the `$streams` namespace.

```javascript {% showCopy=true %}
const { data } = db.useQuery({
  $streams: {
    $: {
      where: { clientId: 'my-unique-stream' },
    },
  },
});
```

The `$streams` entity contains useful information:

- `id`: The persistent stream ID, assigned by the server.
- `clientId`: The ID you provided when creating the stream.
- `done`: A boolean indicating if the stream has been closed.
- `size`: The total number of bytes written to the stream. This will be `null` until `done` is true.
- `abortReason`: A string describing why the stream was aborted, if applicable.

### Customizing Stream Metadata

You can add your own custom columns to the `$streams` table and update them with `db.transact` just like any other entity.

However, all system columns (like `clientId`, `done`, and `size`) are read-only and cannot be edited. If you try to update them directly, the transaction will fail.

### Linking Streams to Entities

When a stream is created, you can get its ID and link it to other entities in your schema. This is useful for associating a stream with a specific user, chat, or project.

First, define the link in your schema:

```ts {% showCopy=true %}
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    chats: i.entity({
      title: i.string().optional(),
    }),
  },
  links: {
    chatStream: {
      forward: { on: 'chats', has: 'one', label: 'stream' },
      reverse: { on: '$streams', has: 'one', label: 'chat' },
    },
  },
});

export default _schema;
```

Then link the stream after creating it:

```javascript {% showCopy=true %}
const stream = db.streams.createWriteStream({ clientId: 'my-chat-session' });
const streamId = await stream.streamId();

// Link the stream to a chat entity
db.transact(db.tx.chats[chatId].link({ stream: streamId }));
```

### Permissions

By default, all rules for streams are set to `"false"`. This means that until you explicitly set rules, non-admins won't be able to view or modify streams.

You control access to streams in `instant.perms.ts` under the `$streams` namespace.

- `create`: Controls who can create and write to streams (this is used by `createWriteStream`). For `create` rules, only `data.clientId` is available.
- `view`: Controls who can read and query streams (this is used by `createReadStream`).
- `update`: Controls updates to stream metadata.
- `delete`: Controls stream deletion.

```javascript {% showCopy=true %}
const rules = {
  $streams: {
    allow: {
      view: 'auth.id != null',
      create: 'auth.id != null',
      update: 'false',
      delete: 'false',
    },
  },
};
```

## Admin SDK and Serverless

Streams are fully supported in the Admin SDK for use in backends or serverless environments like Next.js API routes or Edge Functions.

### `waitUntil`

In serverless environments, the process might be shut down before the stream has finished flushing to the server. You can use the `waitUntil` option to ensure the stream is fully persisted.

```javascript {% showCopy=true %}
// Next.js API Route example
import { after } from 'next/server';
import { init, id } from '@instantdb/admin';

const db = init({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
});

export async function POST(req) {
  const stream = db.streams.createWriteStream({
    clientId: id(),
    waitUntil: after,
  });

  // ... write to stream
}
```

## Building LLM chat apps with the Vercel AI SDK

### resumable-stream

[`@instantdb/resumable-stream`](https://www.npmjs.com/package/@instantdb/resumable-stream) is a drop-in replacement for Vercel's `resumable-stream` library that supports resuming ongoing streams after page reloads. It requires no Redis instance and your streams never expire.

#### Client-side: Enable stream resumption

Use the `resume` option in the `useChat` hook to enable stream resumption. When `resume` is true, the hook automatically attempts to reconnect to any active stream for the chat on mount:

```tsx {% showCopy=true %}
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { id as generateId } from '@instantdb/react';

export function Chat({
  chatData,
}: {
  chatData: { id: string; messages: UIMessage[] };
}) {
  const { messages, sendMessage, status } = useChat({
    id: chatData.id,
    messages: chatData.messages,
    resume: true, // Enable automatic stream resumption
    generateId,
    transport: new DefaultChatTransport({
      // You must send the id of the chat
      prepareSendMessagesRequest: ({ id, messages }) => {
        return {
          body: {
            id,
            message: messages[messages.length - 1],
          },
        };
      },
    }),
  });

  return <div>{/* Your chat UI */}</div>;
}
```

#### Server-side: Create the POST handler

The POST handler creates resumable streams using the `consumeSseStream` callback:

```ts {% showCopy=true %}
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { readChat, saveChat } from '@util/chat-store';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from '@instantdb/resumable-stream';
import { id as generateId } from '@instantdb/admin';

export async function POST(req: Request) {
  const {
    message,
    id,
  }: {
    message: UIMessage | undefined;
    id: string;
  } = await req.json();

  if (!message) return new Response(null, { status: 400 });

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  // Clear any previous active stream and save the user message
  await saveChat({ id, messages: [message], activeStreamId: null });

  const result = streamText({
    model: openai('gpt-4o'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    onFinish: ({ messages: finalMessages }) => {
      // Clear the active stream when finished
      saveChat({ id, messages: finalMessages, activeStreamId: null });
    },
    async consumeSseStream({ stream }) {
      const streamId = generateId();

      // Create a resumable stream from the SSE stream
      const streamContext = createResumableStreamContext({
        waitUntil: after,
        appId: process.env.INSTANT_APP_ID,
        adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
      });
      await streamContext.createNewResumableStream(streamId, () => stream);

      // Update the chat with the active stream ID
      await saveChat({ id, activeStreamId: streamId });
    },
  });
}
```

#### Server-side: Create the GET handler for resumption

```ts {% showCopy=true %}
// app/api/chat/[id]/stream/route.ts
import { readChat } from '@util/chat-store';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from '@instantdb/resumable-stream';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const chat = await readChat(id);

  if (chat.activeStreamId == null) {
    // no content response when there is no active stream
    return new Response(null, { status: 204 });
  }

  const streamContext = createResumableStreamContext({
    waitUntil: after,
    appId: process.env.INSTANT_APP_ID,
    adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
  });

  return new Response(
    await streamContext.resumeExistingStream(chat.activeStreamId),
    { headers: UI_MESSAGE_STREAM_HEADERS },
  );
}
```

## Resume directly from the client

The key advantage of Instant is that the client can reconnect to the stream **directly from the browser** without hitting your backend again.

By implementing a custom `DefaultChatTransport`, the Vercel AI SDK will automatically use Instant to resume any interrupted streams.

```ts {% showCopy=true %}
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';
import { id as generateId } from '@instantdb/react';

class InstantChatTransport extends DefaultChatTransport<UIMessage> {
  async reconnectToStream(
    options: { chatId: string } & Record<string, unknown>,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    try {
      // 1. Find the active stream for this chat
      const { data } = await db.queryOnce({
        $streams: { $: { where: { chat: options.chatId } } },
      });
      const $stream = data.$streams?.[0];
      if (!$stream || $stream.done) return null;

      // 2. Connect to the read stream directly from the browser
      const readStream = db.streams.createReadStream({ streamId: $stream.id });

      // 3. Convert to byte stream for the AI SDK
      const byteStream = readStream.pipeThrough(new TextEncoderStream());
      return this.processResponseStream(byteStream);
    } catch {
      return null;
    }
  }
}

function Chat() {
  const transport = useMemo(
    () =>
      new InstantChatTransport({
        api: '/api/chat',
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    generateId,
    resume: true,
  });

  return /* ... */;
}
```

We'll provide a full example that includes storing chat data in Instant and uses Instant auth for authorization.

If you want to jump into building an app, `create-instant-app` has a working template that uses this pattern:


```sh {% showCopy=true}
npx create-instant-app@latest --base ai-chat
```

### Setup

We'll start with a simple schema for our chats:

```ts {% showCopy=true %}
// src/instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    chats: i.entity({
      title: i.string().optional(),
    }),
    messages: i.entity({
      role: i.string(),
      parts: i.any().optional(),
      metadata: i.any().optional(),
    }),
    $streams: i.entity({
      clientId: i.string().unique().indexed(),
    }),
  },
  links: {
    chatOwner: {
      forward: { on: 'chats', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'chats' },
    },
    chatMessages: {
      forward: { on: 'chats', has: 'many', label: 'messages' },
      reverse: { on: 'messages', has: 'one', label: 'chat' },
    },
    chatStream: {
      forward: { on: 'chats', has: 'one', label: 'stream' },
      reverse: { on: '$streams', has: 'one', label: 'chat' },
    },
  },
});

export default _schema;
```

And we'll set permissions so that the user can read their own chats. We'll handle all writes, except for creating the initial chat, from the server:

```ts {% showCopy=true %}
// src/instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  $default: {
    allow: {
      $default: 'false',
    },
  },
  $users: {
    allow: {
      view: 'auth.id != null && auth.id == data.id',
    },
  },
  chats: {
    allow: {
      view: 'auth.id != null && auth.id == data.owner',
      create: 'auth.id != null && auth.id == data.owner',
    },
  },
  messages: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('chat.owner.id')",
    },
  },
  $streams: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('chat.owner.id')",
    },
  },
} satisfies InstantRules;

export default rules;
```

### Sync auth

We'll set up auth syncing so that the backend that talks to the LLM can authenticate the current user.

```typescript {% showCopy=true %}
// src/lib/db.ts
import { init } from '@instantdb/react/nextjs';
import schema from '@/instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  firstPartyPath: '/api/instant',
});
```

```typescript {% showCopy=true %}
// src/app/api/instant/route.ts
import { createInstantRouteHandler } from '@instantdb/react/nextjs';

export const { POST } = createInstantRouteHandler({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
});
```

```ts {% showCopy=true %}
// src/lib/adminDb.ts
import { init } from '@instantdb/admin';
import schema from '@/instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});
```

### Client components

By implementing a custom `DefaultChatTransport`, the Vercel AI SDK will automatically use Instant to resume any interrupted streams directly from the browser without hitting your backend again.

```tsx {% showCopy=true %}
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';
import { db } from '@/lib/db';
import { id as generateId } from '@instantdb/react';

class InstantChatTransport extends DefaultChatTransport<UIMessage> {
  async reconnectToStream(
    options: { chatId: string } & Record<string, unknown>,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    try {
      // 1. Find the active stream for this chat
      const { data } = await db.queryOnce({
        $streams: { $: { where: { chat: options.chatId } } },
      });
      const $stream = data.$streams?.[0];
      if (!$stream) return null;

      // 2. Connect to the read stream directly from the browser
      const readStream = db.streams.createReadStream({ streamId: $stream.id });

      // 3. Convert to byte stream for the AI SDK
      const byteStream = readStream.pipeThrough(new TextEncoderStream());
      return this.processResponseStream(byteStream);
    } catch {
      return null;
    }
  }
}

function ChatInner({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: UIMessage[];
}) {
  const transport = useMemo(
    () =>
      new InstantChatTransport({
        api: '/api/chat',
        // Send the id of the chat and the last message
        prepareSendMessagesRequest: ({ id, messages }) => {
          return {
            body: {
              id,
              message: messages[messages.length - 1],
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    generateId,
    resume: true, // Enable automatic stream resumption
    transport,
  });

  return <div>{/* Your chat UI */}</div>;
}

export function Chat({ id }: { id: string }) {
  // Fetch messages from Instant
  const {
    isLoading: isLoadingData,
    error: queryError,
    data,
  } = db.useQuery({
    chats: { $: { where: { id } } },
    messages: {
      $: {
        where: { chat: id },
        order: { serverCreatedAt: 'asc' },
      },
    },
  });

  const { isLoading: isLoadingUser, error: authError, user } = db.useAuth();

  const [createError, setCreateError] = useState<string | null>(null);
  const error = queryError || authError;
  const isLoading = isLoadingUser || isLoadingData;
  const createdChatId = useRef<string | null>(null);

  // Insert the chat into the db if it doesn't already exist.
  useEffect(() => {
    if (
      !isLoading &&
      !error &&
      !data?.chats?.[0] &&
      user?.id &&
      createdChatId.current !== id
    ) {
      createdChatId.current = id;
      db.transact(db.tx.chats[id].update({}).link({ owner: user.id })).catch(
        (err) => setCreateError(err.message || 'Failed to create chat'),
      );
    }
  }, [isLoading, error, user?.id, data?.chats, id]);

  if (createError) {
    return <div>Error: {createError}</div>;
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!user) {
    return <div>Log in</div>;
  }

  const messages = (data?.messages || []) as UIMessage[];

  return <ChatInner id={id} initialMessages={messages} />;
}
```

### Server-side: Create the POST handler

The POST handler saves the user message and pipes the AI completion to an Instant write stream.

```ts {% showCopy=true %}
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { after, NextResponse } from 'next/server';
import { id as generateId } from '@instantdb/admin';
import { db } from '@/lib/adminDb';

async function saveChat({
  id,
  messages,
  activeStreamId,
  inactiveStreamId,
}: {
  id: string;
  messages?: UIMessage[];
  activeStreamId?: string | null;
  inactiveStreamId?: string | null;
}): Promise<void> {
  const txs = [];
  if (activeStreamId) {
    txs.push(db.tx.chats[id].link({ stream: activeStreamId }));
  }
  if (inactiveStreamId) {
    txs.push(db.tx.chats[id].unlink({ stream: inactiveStreamId }));
  }

  if (messages) {
    for (const message of messages) {
      txs.push(
        db.tx.messages[message.id]
          .update({
            role: message.role,
            parts: message.parts,
            metadata: message.metadata,
          })
          .link({ chat: id }),
      );
    }
  }

  if (txs.length) {
    await db.transact(txs);
  }
}

export async function POST(req: Request) {
  const {
    message,
    id,
  }: {
    message: UIMessage | undefined;
    id: string;
  } = await req.json();

  const user = await db.auth.getUserFromRequest(req);
  if (!user) return new NextResponse(null, { status: 401 });

  const { chats, messages: existingMessages } = await db.query({
    chats: {
      $: { where: { id, owner: user.id } },
      stream: {},
    },
    messages: {
      $: {
        where: { chat: id },
        order: { serverCreatedAt: 'asc' },
      },
    },
  });

  const chat = chats[0];
  if (!chat) return new NextResponse(null, { status: 404 });
  if (!message) return new NextResponse(null, { status: 400 });

  const history = (existingMessages || []) as UIMessage[];

  const messages = [...history, message];

  // Save the new user message and unlink any stale stream
  await saveChat({
    id,
    messages: [message],
    inactiveStreamId: chat.stream?.id,
  });

  const result = streamText({
    model: openai('gpt-4o'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    onFinish: ({ messages: finalMessages }) => {
      // Save completion and clear active stream
      saveChat({ id, messages: finalMessages });
    },
    async consumeSseStream({ stream }) {
      const writeStream = db.streams.createWriteStream({
        clientId: generateId(),
        waitUntil: after,
      });

      stream.pipeTo(writeStream).catch((err) => {
        console.error('Failed to pipe SSE stream', err);
      });

      // Link the stream to the chat so the client can find it
      const streamId = await writeStream.streamId();
      await saveChat({ id, activeStreamId: streamId });
    },
  });
}
```
