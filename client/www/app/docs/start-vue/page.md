---
nextjs:
  metadata:
    title: Getting started with Vue
    description: How to use Instant with Vue 3 and Vite
---

## Automatic Setup With Create Instant App

The fastest way to get started with Instant with Vue is to use create-instant-app to scaffold a new project with Instant already set up.

To get started run:

```shell
npx create-instant-app --vue
```

## Manual Setup

Create a blank Vue + Vite app:

```shell
npm create vue@latest my-app
```

Add the InstantDB Vue Library:

```shell
npm i @instantdb/vue
```

Use `instant-cli` to set up a new Instant project. This will prompt you to log in if you haven't already. It will then create a schema file, permissions file, and update your `.env` file.

```shell
npx instant-cli init
```

Create a database client in `src/lib/db.ts`:

{% file label="src/lib/db.ts" /%}

```ts
import { init } from '@instantdb/vue';
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
import { i } from '@instantdb/vue';

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

Replace the content of `src/App.vue` with the following:

{% file label="src/App.vue" /%}

```vue {% showCopy=true %}
<script setup lang="ts">
import { ref } from 'vue';
import { id, type InstaQLEntity } from '@instantdb/vue';
import { db } from './lib/db';
import type { AppSchema } from './instant.schema';

type Todo = InstaQLEntity<AppSchema, 'todos'>;

const { isLoading, error, data } = db.useQuery({ todos: {} });

const text = ref('');

function addTodo() {
  const value = text.value.trim();
  if (!value) return;
  db.transact(
    db.tx.todos[id()].update({
      text: value,
      done: false,
      createdAt: Date.now(),
    }),
  );
  text.value = '';
}

function toggleDone(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteTodo(todo: Todo) {
  db.transact(db.tx.todos[todo.id].delete());
}
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <h2>Todos</h2>
    <form @submit.prevent="addTodo">
      <input v-model="text" placeholder="What needs to be done?" type="text" />
    </form>
    <div v-for="todo in data?.todos ?? []" :key="todo.id">
      <input type="checkbox" :checked="todo.done" @change="toggleDone(todo)" />
      <span :class="{ 'line-through': todo.done }">{{ todo.text }}</span>
      <button @click="deleteTodo(todo)">X</button>
    </div>
    <div>
      Remaining todos: {{ (data?.todos ?? []).filter((t) => !t.done).length }}
    </div>
  </div>
</template>
```

Go to `localhost:5173`, and huzzah 🎉 You've got a fully functional todo list running!

## Reactivity

Instant's hooks return an **object of refs**. This lets you destructure the result without losing reactivity, and refs auto-unwrap when you reference them in your template.

```vue
<script setup lang="ts">
const { isLoading, data, error } = db.useQuery({ todos: {} });
// isLoading.value, data.value, error.value are reactive refs
</script>

<template>
  <p v-if="!isLoading">{{ data?.todos.length }} todos</p>
</template>
```

Inside the script you access values via `.value`; inside the template Vue unwraps the ref automatically, so you can write `data?.todos` directly.

For hooks that return a single value (`useConnectionStatus`, `useLocalId`, `useUser`), you get a single `Ref` or `ComputedRef`:

```vue
<script setup lang="ts">
const status = db.useConnectionStatus();
// status.value is reactive
</script>

<template>
  <p>Connection: {{ status }}</p>
</template>
```

### Reactive and conditional queries

The first argument of `useQuery` accepts a `MaybeRefOrGetter<Q | null>`. That means you can pass a plain query object, a `ref` containing a query, a `computed`, or a getter function. Return `null` from a getter to skip the query:

```vue
<script setup lang="ts">
import { db } from './lib/db';

const { user } = db.useAuth();

// Only query when we have a logged-in user
const { isLoading, data } = db.useQuery(() =>
  user.value ? { todos: {} } : null,
);
</script>

<template>
  <p v-if="!user">Please log in.</p>
  <p v-else-if="isLoading">Loading todos...</p>
  <p v-else>{{ data?.todos.length }} todos</p>
</template>
```

Any reactive value read inside the getter automatically re-triggers the query when it changes:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { db } from './lib/db';

const filter = ref<'all' | 'active' | 'done'>('all');

const { data } = db.useQuery(() => {
  if (filter.value === 'all') return { todos: {} };
  return { todos: { $: { where: { done: filter.value === 'done' } } } };
});
</script>

<template>
  <button @click="filter = 'all'">All</button>
  <button @click="filter = 'active'">Active</button>
  <button @click="filter = 'done'">Done</button>
  <p>{{ data?.todos.length }} todos</p>
</template>
```

### Writing data

Transactions in Vue work the same way they do in React via `db.transact`:

```vue
<script setup lang="ts">
import { id } from '@instantdb/vue';
import { db } from './lib/db';

function addTodo(text: string) {
  db.transact(
    db.tx.todos[id()].update({ text, done: false, createdAt: Date.now() }),
  );
}

function toggleDone(todo: { id: string; done: boolean }) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteTodo(todoId: string) {
  db.transact(db.tx.todos[todoId].delete());
}
</script>
```

To learn more see our [writing data](/docs/instaml) docs.

## Auth

The Vue SDK supports all of Instant's [auth methods](/docs/auth): [magic codes](/docs/auth/magic-codes), [guest auth](/docs/auth/guest-auth), [Google OAuth](/docs/auth/google-oauth), and more.

### useAuth

Use `db.useAuth()` to get the current auth state. This gives you full control over loading, error, and user states:

```vue
<script setup lang="ts">
import { db } from './lib/db';

const { isLoading, error, user } = db.useAuth();
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else-if="user">
    <p>Hello, {{ user.isGuest ? 'Guest' : user.email }}!</p>
    <button @click="db.auth.signOut()">Sign out</button>
  </div>
  <div v-else>
    <p>Please log in.</p>
    <button @click="db.auth.signInAsGuest()">Try as guest</button>
  </div>
</template>
```

### SignedIn / SignedOut

For simpler cases where you just need to gate content on auth state, use the `SignedIn` and `SignedOut` guard components instead:

```vue
<script setup lang="ts">
import { SignedIn, SignedOut } from '@instantdb/vue';
import { db } from './lib/db';
</script>

<template>
  <SignedIn :db="db">
    <p>You are logged in!</p>
    <button @click="db.auth.signOut()">Sign out</button>
  </SignedIn>

  <SignedOut :db="db">
    <p>Please log in.</p>
  </SignedOut>
</template>
```

`useAuth` is better when you need access to `isLoading`, `error`, or `user.isGuest`. The guard components are simpler when you just need to show or hide content based on login state.

## Components

### Cursors

A multiplayer cursor component that tracks mouse positions via presence. Wrap any area where you want to show live cursors from other users:

```vue
<script setup lang="ts">
import { Cursors } from '@instantdb/vue';
import { db } from './lib/db';

const room = db.room('main', 'my-room-id');
</script>

<template>
  <Cursors :room="room" userCursorColor="tomato">
    <div>Move your mouse around!</div>
  </Cursors>
</template>
```

The `Cursors` component supports custom cursor rendering via a scoped `cursor` slot, a configurable wrapper element (`as`), and inherits `class`/`style` from the parent. See the [Presence, Cursors, and Activity](/docs/presence-and-topics) docs for more details.

## Nuxt

The Vue SDK works with [Nuxt](https://nuxt.com/). Because Instant is a client-only library (it relies on browser APIs like `WebSocket` and `IndexedDB`), you'll want to either wrap Instant-using components with `<ClientOnly>` or disable SSR for the relevant routes via `routeRules` in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  routeRules: {
    '/my-route/**': { ssr: false },
  },
});
```

Server-side rendering with Instant is not yet supported (let us know if you want this!).
