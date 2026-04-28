# InstantDB rules for no-build React apps

Use this when building a single-file HTML app that can load UMD scripts but
cannot run `instant-cli`, `npx`, `pnpm dlx`, `bunx`, or install packages.

# SDK

Use React UMD, ReactDOM UMD, Babel standalone, and the Instant React UMD.

```html
<div id="root"></div>

<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://www.unpkg.com/@instantdb/react@latest/dist/standalone/index.umd.cjs"></script>
```

These scripts expose globals: `React`, `ReactDOM`, `Babel`, and
`window.instantReact`.

Put JSX inside a Babel script. Do not use `import`, `export`, `type="module"`,
JSX outside the Babel script, `@instantdb/core`, `window.instant`,
`@instantdb/react` imports, or `ReactDOMClient`.

```html
<script type="text/babel" data-presets="react">
  const { init, i, id } = instantReact;
</script>
```

Do not put `INSTANT_ADMIN_TOKEN` in browser code.

# Browser Runtime

The app may run in a sandboxed iframe. Do not use blocking browser modals:
`alert()`, `confirm()`, or `prompt()`. They may be ignored by the browser.

Use in-page UI for confirmations, errors, and input.

# Initialize Instant

Browser apps only need the app id. Pass a schema with `i.schema(...)`.

```html
<script type="text/babel" data-presets="react">
  const { init, i, id } = instantReact;
  const APP_ID = '__INSTANT_APP_ID__';

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

  function App() {
    return <main>Hello</main>;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
```

CRITICAL: The schema must be created with `i.schema(...)`. Do not pass a plain
`{ entities: ... }` object.

CRITICAL: Create `db` outside React components. Hooks use this top-level `db`.

# Auth

Use `db.useAuth()` inside React components.

```js
function App() {
  const auth = db.useAuth();

  if (auth.error) return <ErrorView error={auth.error.message} />;
  if (auth.isLoading) return <LoadingView />;
  if (!auth.user) return <SignInView />;

  return <MainApp user={auth.user} />;
}
```

For guest auth, call `db.auth.signInAsGuest()` from an event handler. There is no
`signInAnonymously()`. Do not add a fallback to `signInAnonymously`.

```js
function SignInView() {
  return <button onClick={() => db.auth.signInAsGuest()}>Continue</button>;
}
```

`db.getLocalId("guest")` creates a browser-local id. It is useful for local UI
identity, but permissions cannot check it. Use Guest Auth when ownership must be
tied to `auth.id`.

# Read Data

Use `db.useQuery(...)` inside React components. It is live.

```js
function ItemList() {
  const { isLoading, error, data } = db.useQuery({
    items: { $: { order: { createdAt: 'asc' } } },
  });

  if (error) return <ErrorView error={error.message} />;
  if (isLoading) return <LoadingView />;

  return data.items.map((item) => <Item key={item.id} item={item} />);
}
```

Do not call `subscribeQuery` from React components. Do not poll. Do not call
hooks conditionally or inside loops.

# Write Data

Use `id()` for new entity ids. Use `update` for create-or-update writes.

```js
async function createItem(user) {
  const itemId = id();
  await db.transact(
    db.tx.items[itemId].update({
      title: 'New item',
      ownerId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}
```

Update, delete, and batch writes:

```js
await db.transact(db.tx.items[itemId].update({ updatedAt: Date.now() }));

await db.transact(db.tx.items[itemId].delete());

await db.transact([
  db.tx.items[id()].update({
    title: 'A',
    ownerId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
  db.tx.items[id()].update({
    title: 'B',
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

In React, use `db.room(...)` and hooks. Do not use vanilla room methods like
`db.joinRoom`, `room.subscribePresence`, `room.publishPresence`, or
`room.subscribeTopic`.

```js
function PresenceView({ name }) {
  const room = db.room('room', 'room-id');
  const { user, peers, isLoading, error, publishPresence } =
    db.rooms.usePresence(room, {});

  React.useEffect(() => {
    publishPresence({ name, status: 'online' });
  }, [name, publishPresence]);

  return <PresenceList user={user} peers={peers} />;
}
```

CRITICAL: `db.rooms.usePresence(room, options)` takes an options object, not a
callback. Use `{}` to read all fields. It returns
`{ user, peers, isLoading, error, publishPresence }`.

Filtered presence:

```js
const { peers, publishPresence } = db.rooms.usePresence(room, {
  keys: ['name', 'status', 'cursorX', 'cursorY'],
  user: true,
});
```

Topics:

```js
function TopicView() {
  const room = db.room('room', 'room-id');
  const publishTopic = db.rooms.usePublishTopic(room, 'event');

  db.rooms.useTopicEffect(room, 'event', (event, peer) => {
    handleRoomEvent(event, peer);
  });

  return (
    <button onClick={() => publishTopic({ type: 'changed', payload: {} })}>
      Send
    </button>
  );
}
```

# Query Guidelines

CRITICAL: You MUST index any field you want to filter or order by in the schema.
If you do not, you will get an error when you try to filter or order by it.

Here is how ordering works:

```text
Ordering:        order: { field: 'asc' | 'desc' }

Example:         $: { order: { createdAt: 'asc' } }

Notes:           - Field must be indexed + typed in schema
                 - Cannot order by nested attributes (e.g. 'owner.name')
```

Here is the full `where` operator map:

```
Equality:        { field: value }

Inequality:      { field: { $ne: value } }

Null checks:     { field: { $isNull: true | false } }

Comparison:      $gt, $lt, $gte, $lte   (indexed + typed fields only)

Sets:            { field: { $in: [v1, v2] } }

Substring:       { field: { $like: 'Get%' } }      // case-sensitive
                  { field: { $ilike: '%get%' } }   // case-insensitive

Logic:           and: [ {...}, {...} ]
                  or:  [ {...}, {...} ]

Nested fields:   'relation.field': value
```

The operator map above is the full set of `where` filters Instant supports right
now. There is no `$exists`, `$nin`, or `$regex`. And `$like` and `$ilike` are
what you use for `startsWith` / `endsWith` / `includes`.

CRITICAL: Pagination keys (`limit`, `offset`, `first`, `after`, `last`,
`before`) only work on top-level namespaces. Do not use them on nested
relations.

Combine multiple field predicates in one `where` object:

```js
const query = {
  items: {
    $: {
      where: {
        ownerId: user.id,
        createdAt: { $gte: startTime },
      },
    },
  },
};
```

Use `null` to skip a query until inputs are ready:

```js
const result = db.useQuery(user ? { items: {} } : null);
```

# Instant Documentation

These links are the Instant documentation table of contents. If you cannot fetch
a URL directly, search for the topic title plus `InstantDB docs` and use the
matching Instant docs page.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Guest Auth](https://www.instantdb.com/docs/auth/guest-auth.md): How to add guest auth to your Instant app.
- [Other Auth](https://instantdb.com/docs/auth.md): Additional auth methods supported by Instant.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.
- [Streams](https://instantdb.com/docs/streams.md): How to use streams with Instant.
- [Stripe Payments](https://instantdb.com/docs/stripe-payments.md): How to integrate Stripe payments with Instant.
- [React Native](https://instantdb.com/docs/start-rn.md): How to use Instant in React Native apps.
- [Vanilla JS](https://instantdb.com/docs/start-vanilla.md): How to use Instant in vanilla JS apps.
- [SolidJS](https://instantdb.com/docs/start-solidjs.md): How to use Instant in SolidJS apps.
- [Svelte](https://instantdb.com/docs/start-svelte.md): How to use Instant in Svelte apps.
- [TanStack](https://instantdb.com/docs/start-tanstack.md): How to use Instant in TanStack apps.

# React Checklist

- Scripts are loaded in this order: React, ReactDOM, Babel, Instant React
- JSX code is inside `<script type="text/babel" data-presets="react">`
- Instant is read from `window.instantReact`
- `const { init, i, id } = instantReact`
- `const db = init({ appId: APP_ID, schema })`
- React renders with `ReactDOM.createRoot(...).render(<App />)`
- Hooks are only called inside React components or custom hooks
- Reads use `db.useQuery`, not `subscribeQuery`
- Auth uses `db.useAuth`, not `subscribeAuth`
- Presence uses `db.rooms.usePresence(room, {})`
- Writes use `db.transact`
- Any filtered or ordered fields are indexed in the schema
- No `alert()`, `confirm()`, or `prompt()`
