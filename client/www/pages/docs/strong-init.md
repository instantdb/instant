---
title: Strong Init (experimental)
---

We're piloting strictly-typed variants of our client libraries that leverage your `instant.schema.ts` definition. We're calling it "Strong Init". Strong Init enhances InstaQL and InstaML methods with deep typesafety and enhances your editor experience with rich intellisence.

If you want to migrate, simply swap out `init` with `init_experimental` and provide it your app's graph schema object.

```ts
import { init_experimental } from '@instantdb/react';
import schema from '~/instant.schema.ts';

const db = init_experimental({
  appId: '__APP_ID__',
  schema,
});

function App() {
  return <Main />;
}
```

## Strong InstaML

In order to leverage your schema in InstaML, just replace all `tx` references with `db.tx`.

```ts
// ❌ instead of global `tx`
tx.todos[id()].update({ done: true });

// ✅ use bound `db.tx`
db.tx.todos[id()].update({ done: true });
// ^^ --- note the db!
```

## Breaking changes

Switching to Strong Init will automatically turn on a feature we're calling RCI - Runtime Cardinality Inference.

Since the new useQuery is schema-aware, we know when to return a single item instead of an array. 🎉 Bear in mind that you'll need to update your call sites for "has one" relationships.

If you want to enable Strong Init without this feature, you can opt out by adding a `cardinalityInference` flag set to `false` in your `init_experimental` call.

## Rooms support

Rooms are still expressed in pure TypeScript. You can enrich your schema with your rooms shape by calling `schema.withRoomSchema<R>`.

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
