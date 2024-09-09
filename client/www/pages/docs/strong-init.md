---
title: Strong Init (experimental)
---

What if you could use the types you defined in `instant.schema.ts`, inside `init`? We have a new version of `init` out that lets you do this. It's in beta, but if you use it, `useQuery` and `transact` will automatically get typesafety and intellisense.

Here's how it works

If you want to migrate, simply swap out `init` with `init_experimental` and provide it your app's graph schema object.

```ts
import { init_experimental } from '@instantdb/react';
// 1. Import your schema file
// Don't have a schema? check out https://www.instantdb.com/docs/cli to get started
import schema from '../instant.schema.ts';

const db = init_experimental({
  appId: '__APP_ID__',
  // 2. Use it inside `init_experimental`
  schema,
});

function App() {
  return <Main />;
}
```

## Strong InstaML

To make sure your transactions are typed, here's what you need to do: 

If you used Instant before, you would use the global `tx` object. Instead, use `db.tx`: 

```ts
// ❌ instead of global `tx`
tx.todos[id()].update({ done: true });

// ✅ use `db.tx`
db.tx.todos[id()].update({ done: true }); // note the `db`
```

## Changes to useQuery

Once you switch to `init_experimental`, your query results get more powerful too. 

Previously, all responses in a `useQuery` returned arrays. Now, we can use your schema to decide. If you have a 'has one' relationship, we can return _just_ one item directly. 


## Rooms support

Rooms are still expressed in pure TypeScript. You can type rooms with `schema.withRoomSchema<R>`. Here's how it looks:

```ts
type RoomSchema = {
  room: {
    presence: {
      example: number;
    };
  };
};

const db = init_experimental({
  appId: '__APP_ID__',
  schema: schema.withRoomSchema<RoomSchema>(),
});
```
