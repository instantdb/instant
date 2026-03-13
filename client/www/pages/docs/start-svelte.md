---
title: Getting started with Svelte
description: How to use Instant with SvelteKit and Svelte 5
---

## Automatic Setup With Create Instant App

The fastest way to get started with Instant with SvelteKit is to use create-instant-app to scaffold a new project with Instant already set up.

To get started run:

```shell
npx create-instant-app --sv
```

## Manual Setup

Create a blank SvelteKit app:

```shell
npx sv create my-app
```

Add the InstantDB Svelte Library:

```shell
npm i @instantdb/svelte
```

Use `instant-cli` to set up a new Instant project. This will prompt you to log in if you haven't already. It will then create a schema file, permissions file, and update your `.env` file.

```shell
npx instant-cli init
```

Create a database client in `src/lib/db.ts`:

{% file label="src/lib/db.ts" /%}

```ts
import { init } from '@instantdb/svelte';
import schema from '../instant.schema';

export const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
});
```

You're now ready to make queries and transactions to your database!

### Creating a To-Do List App

Let's add a "todo" entity to our schema file at `src/instant.schema.ts`:

{% file label="src/instant.schema.ts" /%}

```ts {% showCopy=true lineHighlight="14-18" %}
import { i } from '@instantdb/svelte';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.date(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: '$users',
        has: 'one',
        label: 'linkedPrimaryUser',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'linkedGuestUsers',
      },
    },
  },
  rooms: {},
});

//...
```

Push the schema:

```shell {% showCopy=true %}
npx instant-cli push
```

Instant doesn't support SSR with SvelteKit yet (let us know if you want this!)
so you need to disable SSR for routes that use Instant.

{% file label="src/routes/+page.ts" /%}

```ts {% showCopy=true %}
export const ssr = false;
```

Replace the content of `src/routes/+page.svelte` with the following:

{% file label="src/routes/+page.svelte" /%}

<!-- prettier-ignore-start -->
```html {% showCopy=true %}
<script lang="ts">
  import { id, type InstaQLEntity } from '@instantdb/svelte';
  import { db } from '$lib/db';
  import type { AppSchema } from '../instant.schema';

  type Todo = InstaQLEntity<AppSchema, 'todos'>;

  const query = db.useQuery({ todos: {} });

  let text = $state('');

  function addTodo(todoText: string) {
    db.transact(
      db.tx.todos[id()].update({
        text: todoText,
        done: false,
        createdAt: Date.now(),
      }),
    );
  }

  function deleteTodo(todo: Todo) {
    db.transact(db.tx.todos[todo.id].delete());
  }

  function toggleDone(todo: Todo) {
    db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
  }

  function deleteCompleted(todos: Todo[]) {
    const completed = todos.filter((todo) => todo.done);
    if (completed.length === 0) return;
    const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
    db.transact(txs);
  }
</script>

{#if query.isLoading}
<div>Loading...</div>
{:else if query.error}
<div>Error: {query.error.message}</div>
{:else} {@const todos = query.data?.todos ?? []}
<div>
  <h2>Todos</h2>
  <div>
    <form onsubmit={(e) => {
      e.preventDefault(); if (!text) return; addTodo(text); text = '';
    }}>
      <input
        bind:value={text}
        autofocus
        placeholder="What needs to be done?"
        type="text"
      />
    </form>
    {#each todos as todo (todo.id)}
    <div>
      <input type="checkbox" checked={todo.done} onchange={() =>
        toggleDone(todo)} />
      <span class:line-through={todo.done}>{todo.text}</span>
      <button onclick={() => deleteTodo(todo)}>X</button>
    </div>
    {/each}
    <div>
      Remaining todos: {todos.filter((t) => !t.done).length}
      <button onclick={() =>
        deleteCompleted(todos)}> Delete Completed
      </button>
    </div>
  </div>
</div>
{/if}
```
<!-- prettier-ignore-end -->

Go to `localhost:5173`, and huzzah 🎉 You've got a fully functional todo list running!

## Reactivity

In Svelte 5, Instant's hooks return `$state` proxies. You read properties directly off the returned object, and Svelte automatically tracks them for re-rendering.

<!-- prettier-ignore-start -->
```html
<script lang="ts">
  const query = db.useQuery({ todos: {} });
  // query.isLoading, query.data, query.error are all reactive
</script>

{#if !query.isLoading}
<p>{query.data?.todos.length} todos</p>
{/if}
```
<!-- prettier-ignore-end -->

For primitive values like connection status and local IDs, hooks return a `{ current: value }` wrapper (since primitives cannot be `$state` proxies):

<!-- prettier-ignore-start -->
```html
<script lang="ts">
  const status = db.useConnectionStatus();
  // status.current is reactive
</script>

<p>Connection: {status.current}</p>
```
<!-- prettier-ignore-end -->

Transactions in Svelte work the same way they do in React via `db.transact`. To learn more see our [writing data](/docs/instaml) docs.

## Components

The Svelte SDK includes a few helper components for common patterns.

### SignedIn / SignedOut

Auth guard components that conditionally render their children based on login state:

<!-- prettier-ignore-start -->
```html
<script lang="ts">
  import { SignedIn, SignedOut } from '@instantdb/svelte';
  import { db } from '$lib/db';
</script>

<SignedIn {db}>
  <p>You are logged in!</p>
  <button onclick={() => db.auth.signOut()}>Sign out</button>
</SignedIn>

<SignedOut {db}>
  <p>Please log in.</p>
</SignedOut>
```
<!-- prettier-ignore-end -->

### Cursors

A multiplayer cursor component that tracks mouse positions via presence. Wrap any area where you want to show live cursors from other users:

<!-- prettier-ignore-start -->
```html
<script lang="ts">
  import { Cursors } from '@instantdb/svelte';
  import { db } from '$lib/db';

  const room = db.room('main', 'my-room-id');
</script>

<Cursors {room} userCursorColor="tomato">
  <div>Move your mouse around!</div>
</Cursors>
```
<!-- prettier-ignore-end -->

The `Cursors` component supports custom cursor rendering via a `renderCursor` snippet, a configurable wrapper element (`as`), and `className`/`style` props for styling. See the [Presence, Cursors, and Activity](/docs/presence-and-topics) docs for more details.
