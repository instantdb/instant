<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/webhooks</h1>
</p>

<p align="center">
  <a
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" alt="Discord members" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/webhooks">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://www.instantdb.com/docs/webhooks">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
</p>

Welcome to [Instant's](http://instantdb.com) webhooks library.

This package gives you the building blocks for working with Instant webhooks: verifying incoming requests, dispatching records to typed handlers, and managing webhook subscriptions and their delivery history.

# Where to use this

The `Webhooks` class is re-exported from a few places. Use whichever fits your setup:

- **From `@instantdb/admin`** — most apps. `db.webhooks` is wired up for you. An admin token is only required if you also want to manage webhooks (`db.webhooks.manager.*`); the receiving side (`processRequest` / `validate`) works without one.
- **From `@instantdb/platform`** — building on top of Instant on behalf of other users. `api.webhooks(appId)` returns a `Webhooks` instance, and the platform SDK transparently refreshes the OAuth token for manager calls. Auth is only required if you'll use `manager.*`.
- **Standalone from `@instantdb/webhooks`** — useful if you don't want to pull in the rest of the admin SDK. Again, no admin token is needed unless you'll call `manager.*`.

## From the admin SDK

```ts
import { init } from '@instantdb/admin';
import schema from './instant.schema';

// adminToken is optional if you're only using the SDK for the receiving side
// of webhooks (processRequest / validate / etc.). Include it if you also want
// to use db.webhooks.manager.* — or any other admin-SDK feature that requires
// auth, like writes or impersonation.
const db = init({
  appId: process.env.INSTANT_APP_ID!,
  schema,
});

// db.webhooks is a Webhooks<typeof schema> instance.
await db.webhooks.processRequest(handlers, req);
```

## From the platform SDK

```ts
import { PlatformApi } from '@instantdb/platform';
import schema from './instant.schema';

// Auth is optional if you're only using PlatformApi for the receiving side of
// webhooks. Include it if you also want to use webhooks.manager.* (or any
// other platform-SDK feature). When provided, the platform SDK refreshes the
// OAuth token transparently for manager calls.
const api = new PlatformApi({ auth: { token: accessToken } });

const webhooks = api.webhooks(appId, { schema });

await webhooks.processRequest(handlers, req);
```

## Standalone

```ts
import { Webhooks } from '@instantdb/webhooks';
import schema from './instant.schema';

// For receiving only (validate / processRequest / processPayload), the
// adminToken is optional — you just need appId + schema for typed handlers.
const webhooks = new Webhooks<typeof schema>({
  appId: process.env.INSTANT_APP_ID!,
  schema,
});

// To also manage webhooks (manager.create, manager.list, …) pass adminToken.
const webhooksWithManager = new Webhooks<typeof schema>({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});
```

`new Webhooks(config)` accepts:

- `appId` — required for `manager.*`; recommended for the receiving side so error messages and helpers are scoped.
- `adminToken` (or `token`) — required for `manager.*`. Not needed to verify signatures or dispatch handlers.
- `schema` — optional. Pass your schema to get fully typed `record.before` / `record.after` in handlers and typed `etypes` on `manager.create` / `manager.update`.
- `apiURI` — defaults to `https://api.instantdb.com`. Override for self-hosted or local development.
- `withAuth` — advanced hook used by the platform SDK to inject a fresh OAuth token per request; you generally won't pass this directly.

The rest of this README uses `db.webhooks` in examples. The same methods exist on a standalone `Webhooks` instance or on `api.webhooks(appId)`.

# Receiving webhooks

## `processRequest(handlers, req, opts?)`

The one-liner for handling an incoming webhook. It:

1. Verifies the `Instant-Signature` header against the raw body.
2. Fetches the records via the short-lived `payloadUrl` + JWT in the body.
3. Dispatches each record to the matching handler.

Pass it a Web [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) (Next.js App Router, Cloudflare Workers, Deno, Bun, Hono, etc.):

```ts
// app/api/instant-webhook/route.ts
import { Webhooks } from '@instantdb/admin';

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

Options:

- `tolerance` — max signature age in seconds (default `300`). Protects against replays; raising this weakens that.
- `receivedAt` — override the "now" used when checking signature age. Mostly useful in tests.

Handler resolution is most-specific-wins: `etype` + `action` → that etype's `$default` → top-level `$default`. Records with no matching handler are skipped.

Handlers run concurrently. `processRequest` resolves once all of them settle. If any handler rejects, the call rejects — return a non-2xx response so Instant retries the event.

Instant gives each delivery attempt a **15-second timeout** before recording it as a `timeout` error and retrying. Keep your handlers fast — push slow work (emails, third-party APIs, image processing) onto a queue and respond `2xx` as soon as the job is durably enqueued.

## `processNodeRequest(handlers, req, opts?)`

Adapter for frameworks that hand you a Node-style `IncomingMessage` instead of a Web `Request` — Next.js Pages Router, Express, Koa, NestJS, Fastify, etc. The raw bytes of the body are required to verify the signature, so **don't put a JSON body parser in front of this route** (`express.json()`, Next's default `bodyParser`, etc.).

The adapter picks up the raw body from, in order: `opts.body`, `req.rawBody`, `req.body` (if it's a `Buffer`/`Uint8Array`/string), then the unconsumed request stream.

Next.js Pages Router:

```ts
// pages/api/instant-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: false } };

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

Express (use `express.raw` on the webhook route only):

```ts
app.post(
  '/webhooks/instant',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      await db.webhooks.processNodeRequest(handlers, req);
      res.status(200).end();
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  },
);
```

Koa with `raw-body`:

```ts
router.post('/webhooks/instant', async (ctx) => {
  await db.webhooks.processNodeRequest(handlers, ctx.req, {
    body: rawBody(ctx.req), // adapter awaits the Promise
  });
  ctx.status = 200;
});
```

NestJS (Express adapter, with `NestFactory.create(AppModule, { rawBody: true })`):

```ts
@Controller('webhooks')
export class WebhooksController {
  @Post('instant')
  @HttpCode(200)
  async handle(@Req() req: Request) {
    await db.webhooks.processNodeRequest(handlers, req);
  }
}
```

If the adapter detects that an upstream parser turned the body into an object, it re-serializes it and tries anyway — but if the bytes don't match what Instant signed, you'll get a targeted error telling you to switch the route off the JSON parser.

## `processPayload(handlers, payload)`

Dispatches a payload you've already fetched. Useful when you'd rather do signature verification yourself (or when you're replaying an event from `manager.getPayload`).

```ts
const body = await db.webhooks.validate(signatureHeader, rawBody);
const payload = await db.webhooks.fetchPayloads(body);
await db.webhooks.processPayload(handlers, payload);
```

Same resolution rules and concurrency model as `processRequest`: handlers run in parallel, and if any of them rejects the call rejects too — return a non-2xx response so Instant retries the event. If you'd rather have a per-handler failure not fail the whole batch, wrap that handler's body in `try`/`catch`.

## `validate(signatureHeader, body, opts?)`

Parses an `Instant-Signature` header, verifies it against the body, and returns the `{ payloadUrl, token }` you'd use to fetch the records. Throws if the signature doesn't validate, is older than `opts.tolerance` (default 300 seconds), or the body isn't the expected shape.

```ts
const { payloadUrl, token } = await db.webhooks.validate(
  signatureHeader,
  rawBody,
  { tolerance: 300 },
);
```

`body` can be a string or a function returning a `Promise<string>` — pass the function form to defer reading the request stream until after the header has been parsed.

## `validateRequest(req, opts?)`

Convenience wrapper around `validate`: pulls `instant-signature` and the body off a Web `Request` for you.

```ts
const { payloadUrl, token } = await db.webhooks.validateRequest(req);
```

## `fetchPayloads({ payloadUrl, token })`

Exchanges the `{ payloadUrl, token }` from a validated body for the full payload of records. Returns a `WebhookPayload<Schema>`.

```ts
const payload = await db.webhooks.fetchPayloads({ payloadUrl, token });
console.log(payload.idempotencyKey, payload.data.length);
```

## `helpers()` and `Webhooks.helpers<Schema>()`

Schema-bound helpers for building typed handler maps:

- `typedHandlers(etype, action, handler)` — typed entry for one `etype` + `action`. Pass `'$default'` for `action` to handle every action for that etype.
- `typedHandlers('$default', handler)` — top-level catch-all.
- `combineHandlers(...entries)` — merges entries into a single `WebhookHandlers` object suitable for `processRequest` / `processPayload`.

Two ways to get them:

```ts
// Instance form — infers Schema from the instance, no type argument needed.
const { typedHandlers, combineHandlers } = db.webhooks.helpers();

// Static form — useful when you don't have a Webhooks instance handy.
const { typedHandlers, combineHandlers } = Webhooks.helpers<typeof schema>();
```

Inside each handler, `record.before` and `record.after` are typed according to your schema and narrowed on `action` (`create` ⇒ `before: null`, `delete` ⇒ `after: null`).

# Managing webhooks

`db.webhooks.manager` exposes CRUD on webhooks and access to their delivery history. All `manager.*` methods require an `adminToken` (admin SDK) or platform OAuth token (platform SDK).

## `manager.list()`

Returns every webhook configured on the app, newest first. Includes both active and disabled webhooks.

```ts
const webhooks = await db.webhooks.manager.list();
```

## `manager.create({ url, etypes, actions })`

Creates a webhook in the `active` state. It starts receiving matching events immediately.

```ts
const webhook = await db.webhooks.manager.create({
  url: 'https://example.com/instant',
  etypes: ['posts', 'comments'],
  actions: ['create', 'update'],
});
```

The server rejects the request if `url` isn't an HTTPS URL pointing at a public host, if `etypes` doesn't reference any entity in the app's schema, if `actions` is empty, or if the app has hit its **100 active webhooks** limit.

## `manager.update(webhookId, params)`

Patches `url`, `etypes`, and/or `actions`. Omitted fields keep their current value. Does not affect status — use `enable` / `disable` for that.

```ts
await db.webhooks.manager.update(webhook.id, {
  actions: ['create', 'update'],
});
```

## `manager.delete(webhookId)`

Deletes a webhook. No further events will be queued for it. Returns the webhook as it looked just before deletion.

```ts
await db.webhooks.manager.delete(webhook.id);
```

## `manager.enable(webhookId)`

Re-enables a disabled webhook. Clears `disabledReason` and resumes delivery for new events. Events that occurred while the webhook was disabled are **not** retroactively delivered.

```ts
await db.webhooks.manager.enable(webhook.id);
```

## `manager.disable(webhookId, opts?)`

Stops queuing new events for a webhook. In-flight events already being processed will still complete. Optionally attach a human-readable `reason` that shows up in the dashboard.

```ts
await db.webhooks.manager.disable(webhook.id, {
  reason: 'paused for migration',
});
```

Instant also disables webhooks automatically after repeated delivery failures.

## `manager.listEvents(webhookId, opts?)`

Returns a page of delivery events for a webhook, newest first. Events are retained for ~60 days.

```ts
let cursor: string | null = null;
do {
  const { events, pageInfo } = await db.webhooks.manager.listEvents(
    webhook.id,
    {
      after: cursor,
    },
  );
  for (const event of events) {
    console.log(event.isn, event.status, event.attempts);
  }
  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);
```

Each event's `attempts` array records, per attempt: HTTP status, response body (first 256 bytes), duration, and an `errorType` tag (`timeout`, `dns`, `connect`, `tls`, `protocol`, `network`, `unknown`) when delivery failed.

## `manager.getEvent(webhookId, isn)`

Fetches a single event by its `isn` (Instant Sequence Number).

```ts
const event = await db.webhooks.manager.getEvent(webhook.id, isn);
```

## `manager.getPayload(webhookId, isn)`

Returns the full payload (records + `idempotencyKey`) for an event. Useful for replaying delivery locally with `processPayload`.

```ts
const payload = await db.webhooks.manager.getPayload(webhook.id, isn);
await db.webhooks.processPayload(handlers, payload);
```

## `manager.resendEvent(webhookId, isn)`

Re-queues an event for delivery, regardless of its current status. Use this to retry a `failed` event or force a redelivery of a `success` one.

```ts
await db.webhooks.manager.resendEvent(webhook.id, isn);
```

Rate-limited per event — calling it twice in quick succession returns a validation error asking you to wait about a minute.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
