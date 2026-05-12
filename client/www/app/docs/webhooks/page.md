---
nextjs:
  metadata:
    title: 'Webhooks'
    description: 'How to receive, verify, and manage Instant webhooks.'
---

Webhooks allow you to subscribe to changes to your entities via POST requests to your server.

## How webhooks work

A webhook subscribes to one or more **entity types** (namespaces) and **actions** (`create`, `update`, `delete`). Whenever a matching write commits, Instant queues an event and POSTs it to your endpoint.

Each request carries an `Instant-Signature` header and a small body. The body holds a short-lived URL and a JWT — you exchange them for the full payload of records:

```json
{
  "data": [
    {
      "etype": "posts",
      "id": "<entity-id>",
      "action": "update",
      "before": { "id": "<entity-id>", "title": "Old title" },
      "after": { "id": "<entity-id>", "title": "New title" },
      "idempotencyKey": "<per-record-key>"
    }
  ],
  "idempotencyKey": "<batch-key>"
}
```

`before` is `null` on `create`, `after` is `null` on `delete`. The `idempotencyKey` is stable across redeliveries — use it to dedupe if your handler isn't idempotent on its own.

### Delivery and retries

Instant retries failed deliveries with backoff. An event moves through these stages:

- `pending` — queued, not yet attempted
- `processing` — a sender is actively trying to deliver
- `success` — receiver returned `2xx`
- `error` — an attempt failed; another retry is scheduled
- `failed` — all retries exhausted; will not be retried automatically

Each delivery attempt has a **15-second timeout** — if your endpoint hasn't responded by then the attempt is recorded as a `timeout` error and Instant retries. Do any slow work (sending emails, calling third-party APIs, etc.) asynchronously, and respond with `2xx` as soon as you've durably enqueued the work.

A webhook that fails too many times in a row is automatically disabled. You can re-enable it from the dashboard or via the SDK once you've fixed the receiver.

## Setting up a webhook

The easiest way to create a webhook is from the **Webhooks** tab in the dashboard: pick the entity types, the actions, and the URL Instant should POST to.

You can also create webhooks programmatically from the admin SDK:

```ts {% showCopy=true %}
// scripts/create-webhook.ts
import { init } from '@instantdb/admin';
import schema from './instant.schema';

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const webhook = await db.webhooks.manager.create({
  url: 'https://example.com/api/instant-webhook',
  etypes: ['posts', 'comments'],
  actions: ['create', 'update'],
});
```

The URL must be `https` and resolve to a public host. An app can have up to **100 active webhooks** at a time.

## Receiving webhooks

`db.webhooks.processRequest` is the one-liner for handling incoming events. It verifies the signature, fetches the payload, and dispatches each record to your code.

### Next.js (App Router)

```ts {% showCopy=true %}
// app/api/instant-webhook/route.ts
import { init } from '@instantdb/admin';
import { sendNewPostEmail } from '@./lib/emails';
import schema from '@/instant.schema';

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  schema,
});

const { typedHandlers, combineHandlers } = db.webhooks.helpers();

const handlers = combineHandlers(
  typedHandlers('posts', 'create', async (record) => {
    await sendNewPostEmail(record.after);
  }),
  typedHandlers('posts', 'update', (record) => {
    console.log('post %s changed', record.id, record.before, record.after);
  }),
  typedHandlers('$default', (record) => {
    console.log('unhandled record', record);
  }),
);

export async function POST(req: Request) {
  await db.webhooks.processRequest(handlers, req);
  return new Response('ok');
}
```

`Webhooks.helpers<typeof schema>()` gives you `typedHandlers` and `combineHandlers`. Inside each handler, `record.before` and `record.after` are typed according to your schema — TypeScript will autocomplete fields and narrow on `action`.

Handler resolution is most-specific-wins: `etype` + `action`, then the `etype`'s `$default`, then the top-level `$default`. Records with no matching handler are skipped.

Handlers run concurrently. `processRequest` resolves once every handler resolves or a handler rejects; if any handler rejects, the call rejects too — return a non-2xx response so Instant retries.

### Next.js (Pages Router)

The Pages Router gives you a Node-style request, so use `processNodeRequest`. You also need to disable Next's body parser so the raw bytes are available for signature verification:

```ts {% showCopy=true %}
// pages/api/instant-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { init, Webhooks } from '@instantdb/admin';
import schema from '@/instant.schema';

// Signature verification requires the raw bytes
export const config = { api: { bodyParser: false } };

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();

const handlers = combineHandlers(
  typedHandlers('posts', 'create', async (record) => {
    await sendNewPostEmail(record.after);
  }),
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await db.webhooks.processNodeRequest(handlers, req);
    res.status(200).end();
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
}
```

### Express / other Node frameworks

Anywhere you have a Web `Request`, `processRequest` works directly. For frameworks that hand you a Node request, either bridge it to a `Request` yourself or read the raw body and call `validate` / `fetchPayloads` / `processPayload`:

```ts {% showCopy=true %}
import express from 'express';
import { init, Webhooks } from '@instantdb/admin';
import schema from './instant.schema';

const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();

const handlers = combineHandlers(
  typedHandlers('$default', (record) => console.log(record)),
);

const app = express();

app.post(
  '/api/instant-webhook',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const db = init({
      appId: process.env.INSTANT_APP_ID!,
      schema,
    });

    const signature = req.header('instant-signature')!;
    const body = req.body.toString('utf8');
    try {
      const webhookBody = await db.webhooks.validate(signature, body);
      const payload = await db.webhooks.fetchPayloads(webhookBody);
      await db.webhooks.processPayload(handlers, payload);
      res.status(200).send('ok');
    } catch (e) {
      res.status(400).send(String(e));
    }
  },
);
```

## Verifying signatures manually

If you'd rather not use the handler dispatch, you can stop after verification. `validate` parses and checks the `Instant-Signature` header against the body and returns the `{ payloadUrl, token }` you'd use to fetch records:

```ts {% showCopy=true %}
const { payloadUrl, token } = await db.webhooks.validate(
  signatureHeader,
  rawBody,
  { tolerance: 300 }, // max signature age in seconds; default 300
);

// Or, if you already have a Web Request:
const body = await db.webhooks.validateRequest(req);

const payload = await db.webhooks.fetchPayloads({ payloadUrl, token });
```

`validate` rejects requests whose signature is older than `tolerance` (default: 5 minutes) — this is what protects against replays, so don't crank it up without thinking about it.

## Managing webhooks programmatically

`db.webhooks.manager` exposes CRUD on webhooks and access to their delivery history. Use it from the admin SDK when you want to provision webhooks from code (e.g. during onboarding) rather than from the dashboard.

```ts {% showCopy=true %}
// List
const webhooks = await db.webhooks.manager.list();

// Create
const hook = await db.webhooks.manager.create({
  url: 'https://example.com/instant',
  etypes: ['posts'],
  actions: ['create', 'update', 'delete'],
});

// Update — pass only the fields you want to change
await db.webhooks.manager.update(hook.id, {
  actions: ['create', 'update'],
});

// Disable / re-enable
await db.webhooks.manager.disable(hook.id, { reason: 'paused for migration' });
await db.webhooks.manager.enable(hook.id);

// Delete
await db.webhooks.manager.delete(hook.id);
```

`update` is a patch — omitted fields keep their current value. `disable` and `enable` don't change the config, only whether new events are queued. Events that occurred while a webhook was disabled are **not** retroactively delivered when you re-enable it.

## Inspecting events

Every delivery attempt is recorded for ~60 days and is queryable through the manager. This is useful when a downstream system seems out of sync, or when you want to replay a missed event.

```ts {% showCopy=true %}
// Page through events, newest first
let cursor: string | null = null;
do {
  const { events, pageInfo } = await db.webhooks.manager.listEvents(hook.id, {
    after: cursor,
  });
  for (const event of events) {
    console.log(event.isn, event.status, event.attempts);
  }
  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

// Fetch one event by its isn (Instant Sequence Number)
const event = await db.webhooks.manager.getEvent(hook.id, isn);

// Fetch the full payload for an event
const payload = await db.webhooks.manager.getPayload(hook.id, isn);

// Force a redelivery (works on success, error, or failed)
await db.webhooks.manager.resendEvent(hook.id, isn);
```

Each `event.attempts` entry records the HTTP status, response body (first 256 bytes), duration, and an `errorType` tag (`timeout`, `dns`, `connect`, `tls`, `protocol`, `network`, `unknown`) when delivery failed — usually enough to tell whether the receiver is the problem or the network is.

`resendEvent` is rate-limited per event; if you call it twice in quick succession the second call will return a validation error and ask you to wait about a minute.
