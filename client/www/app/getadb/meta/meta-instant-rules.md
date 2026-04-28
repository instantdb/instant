# InstantDB rules for no-build vanilla apps

Use this when building a single-file HTML app or any environment that cannot run
`instant-cli`, `npx`, `pnpm dlx`, `bunx`, or install packages.

# SDK

Use the vanilla SDK, not the React SDK.

```html
<script src="https://www.unpkg.com/@instantdb/core@latest/dist/standalone/index.umd.cjs"></script>
```

The UMD build exposes `window.instant`.

```html
<script>
  const { init, i, id } = instant;
</script>
```

Do not use React, JSX, Babel, hooks, `@instantdb/react`, `db.useQuery`, or
`db.useAuth`. Do not put `INSTANT_ADMIN_TOKEN` in browser code.

# Initialize Instant

Browser apps only need the app id. Pass a schema with `i.schema(...)`.

```js
const APP_ID = "__INSTANT_APP_ID__";

const schema = i.schema({
  entities: {
    items: i.entity({
      title: i.string(),
      ownerId: i.string().indexed(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
      metadata: i.json().optional(),
    }),
  },
  rooms: {
    room: {
      presence: i.entity({
        name: i.string().optional(),
        status: i.string().optional(),
        cursorX: i.number().optional(),
        cursorY: i.number().optional(),
      }),
      topics: {
        event: i.entity({
          type: i.string(),
          payload: i.json().optional(),
        }),
      },
    },
  },
});

const db = init({ appId: APP_ID, schema });
```

CRITICAL: The schema must be created with `i.schema(...)`. Do not pass a plain
`{ entities: ... }` object.

# Auth

Use `db.subscribeAuth` in vanilla apps.

```js
db.subscribeAuth((auth) => {
  if (auth.error) {
    renderError(auth.error.message);
    return;
  }

  if (auth.user) {
    renderSignedIn(auth.user);
  } else {
    renderSignedOut();
  }
});
```

For guest auth, use `db.auth.signInAsGuest()`. There is no
`signInAnonymously()`.

```js
await db.auth.signInAsGuest();
```

`db.getLocalId("guest")` creates a browser-local id. It is useful for local UI
identity, but permissions cannot check it. Use Guest Auth when ownership must be
tied to `auth.id`.

# Read Data

Use `db.subscribeQuery`. It is live and returns an unsubscribe function.

```js
const unsubscribe = db.subscribeQuery(
  { items: { $: { order: { createdAt: "asc" } } } },
  (resp) => {
    if (resp.error) {
      renderError(resp.error.message);
      return;
    }

    if (resp.data) {
      render(resp.data.items);
    }
  }
);
```

Do not poll and do not call `subscribeQuery` repeatedly from `render()`.

# Write Data

Use `id()` for new entity ids. Use `update` for create-or-update writes.

```js
const itemId = id();
await db.transact(
  db.tx.items[itemId].update({
    title: "New item",
    ownerId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
);
```

Update, delete, and batch writes:

```js
await db.transact(db.tx.items[itemId].update({ updatedAt: Date.now() }));

await db.transact(db.tx.items[itemId].delete());

await db.transact([
  db.tx.items[id()].update({
    title: "A",
    ownerId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
  db.tx.items[id()].update({
    title: "B",
    ownerId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
]);
```

# Presence and Topics

Use presence for ephemeral UI like online users, cursors, selections, and typing
state. Do not store ephemeral state with `transact`.

Use topics for fire-and-forget room events.

In the vanilla SDK, use `db.joinRoom(...)`. Do not use React room hooks like
`db.rooms.usePresence`.

```js
const room = db.joinRoom("room", "room-id", {
  initialPresence: { name: "Guest", status: "online" },
});

const unsubscribePresence = room.subscribePresence(
  { keys: ["name", "status", "cursorX", "cursorY"] },
  (presence) => {
    if (presence.error) {
      renderError(presence.error);
      return;
    }

    renderPresence(presence.user, presence.peers);
  }
);

room.publishPresence({ status: "active" });

const unsubscribeTopic = room.subscribeTopic("event", (event) => {
  handleRoomEvent(event);
});

room.publishTopic("event", { type: "changed", payload: { id: itemId } });
```

Presence callbacks receive `{ user, peers, isLoading, error }`. `peers` is an
object keyed by peer id. `publishPresence` merges with the current user's
presence object. `subscribePresence` and `subscribeTopic` return unsubscribe
functions. Call `room.leaveRoom()` if the app leaves that room.

# Query Guidelines

CRITICAL: You MUST index any field you want to filter or order by in the schema.

Ordering:

```js
{ items: { $: { order: { createdAt: "asc" } } } }
```

Notes:

- Ordered fields must be indexed and typed in schema
- Cannot order by nested attributes

Where operators:

```js
Equality:      { field: value }
Inequality:    { field: { $ne: value } }
Null checks:   { field: { $isNull: true } }
Comparison:    $gt, $lt, $gte, $lte
Sets:          { field: { $in: [v1, v2] } }
Substring:     { field: { $like: "Get%" } }
               { field: { $ilike: "%get%" } }
Logic:         and: [ {...}, {...} ]
               or:  [ {...}, {...} ]
Nested fields: "relation.field": value
```

The operator map above is the full set of `where` filters Instant supports right
now. There is no `$exists`, `$nin`, or `$regex`.

Pagination keys (`limit`, `offset`, `first`, `after`, `last`, `before`) only
work on top-level namespaces.

# Permissions

If you cannot configure permissions, do not claim server-enforced ownership or
security. You can still hide controls in the UI, but that is not a permission
rule.

When permissions are configured elsewhere, owner-only checks should store an
owner id from `auth.id` and compare against it:

```cel
auth.id == data.ownerId
```

# Test Before Returning

- `window.instant` exists
- `typeof db.subscribeQuery === "function"`
- `typeof db.auth.signInAsGuest === "function"`
- `typeof db.joinRoom === "function"`
- `typeof room.publishPresence === "function"`
- No JSX syntax errors
- Reads, writes, auth, and presence all work in preview
