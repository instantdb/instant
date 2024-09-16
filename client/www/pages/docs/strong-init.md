---
title: Strong Init (experimental)
---

What if you could use the types you defined in `instant.schema.ts`, inside `init`? We have a new version of `init` out that lets you do this. It's in beta, but if you use it, `useQuery` and `transact` will automatically get typesafety and intellisense.

Here's how it works

If you want to migrate, swap out `init` with `init_experimental` and pass it your app's graph schema object.

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

export default function App() {
  // 3. now useQuery is strongly typed!
  const todosRes = db.useQuery({
    todos: {},
  });

  function addTodo({ title: string }) {
    db.transact([
      // 4. mutations are typechecked too!
      db.tx.todos[id()].update({ title }),
    ]);
  }

  return <TodoApp todosRes={todosRes} onAddTodo={addTodo} />;
}
```

## Changes to `tx`

If you used Instant before, you would use the global `tx` object. Instead, use the schema-aware `db.tx`.

```ts
// ✅ use `db.tx`
db.tx.todos[id()].update({ done: true }); // note the `db`
```

## Changes to useQuery

Once you switch to `init_experimental`, your query results get more powerful too.

Previously, all responses in a `useQuery` returned arrays. Now, we can use your schema to decide. If you have a 'has one' relationship, we can return _just_ one item directly.

Since the new `useQuery` is schema-aware, we know when to return a single item instead of an array. 🎉 Bear in mind that if you're migrating from `init`, you'll need to update all of your call sites that reference these "has-one" relationships.

```ts
const { data } = useQuery({ users: { author: {} }});
const firstUser = data.users[0];

// before
const author = firstUser.author[0];

// after
const author = firstUser.author; // no more array! 🎉
```

If you don't want to migrate your components just yet, you can opt out by adding a `cardinalityInference` flag set to `false` in your `init_experimental` call. This way, you'll get all the typechecking benefits without having to update your logic.

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
