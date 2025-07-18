---
title: Initializing Instant
description: How to integrate Instant with your app.
---

## Basic Initialization

The first step to using Instant in your app is to call `init`. Here is a simple
example at the root of your app.

```javascript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

function App() {
  return <Main />;
}
```

With that, you can use `db` to [write data](/docs/instaml), [make queries](/docs/instaql), [handle auth](/docs/auth), and more!

## Typesafety

If you're using typescript, `init` accepts a `schema` argument. Adding a schema provides auto-completion and typesafety for your queries and transactions.

```typescript
import { init, i } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

const schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.any(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
  },
});

const db = init({ appId: APP_ID, schema });
```

To learn more about writing schemas, head on over to the [Modeling your data](/docs/modeling-data) section.

## Flexible Initialization

Instant maintains a single connection regardless of where or how many times you
call `init` with the same app ID. This means you can safely call `init` multiple
times without worrying about creating multiple connections or
performance overhead. However we do recommend the pattern of exporting a
reference from a utility file like so:

<!-- prettier-ignore-start -->
```typescript
// lib/db.ts
import { init } from '@instantdb/react';
import schema from '../instant.schema';

// Instant app
const APP_ID = '__APP_ID__';
export const db = init({ appId: APP_ID, schema });

// app/page.tsx
"use client";

import { db } from '../lib/db';

function App() {
  // do some instant magic 🪄
  db.useQuery({ todos: {} });
}

export default App;
```
<!-- prettier-ignore-end -->

## Configuration Options

`init` accepts a few options. For most use cases you'll want to provide `appId`
and `schema`. Here are all the options you can provide:

- **appId** (required): Your InstantDB application ID. This identifies your app and is used to connect to the correct backend.

- **schema?**: Instant schema export from your `instant.schema.ts` file. Provide this for typesafety and auto-completion in queries, transactions, and ephemeral features.

- **websocketURI?**: Custom WebSocket endpoint for real-time connections. Defaults to `'wss://api.instantdb.com/runtime/session'`. Change this for connecting to development or self-hosted instances.

- **apiURI?**: Custom HTTP API endpoint for auth and storage operations. Defaults to `'https://api.instantdb.com'`. Change this for connecting to development or self-hosted instances.

- **devtool?**: Controls the Instant dev tool. Defaults to `true` on localhost. Set to `false` to disable, or configure with `{ position: 'bottom-right', allowedHosts: ['localhost'] }`.

- **verbose?**: Enables detailed console logging for debugging. When `true`, logs WebSocket messages and internal operations. Helpful for troubleshooting connection and sync issues.

- **queryCacheLimit?**: Maximum number of query subscriptions to cache for offline mode. Defaults to `10`. Cached queries provide instant data on app reload while fresh data loads in the background.
