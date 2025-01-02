---
title: Patterns
---

Below are some common patterns for working with InstantDB. We'll add more
patterns over time and if you have a pattern you'd like to share, please feel
free to submit a PR for this page.

## You can expose your app id to the client.

Similar to Firebase, the app id is a unique identifier for your application.
If you want to secure your data, you'll want to add
[permissions](/docs/permissions) for the app.

## Restrict creating new attributes.

When your ready to lock down your schema, you can restrict creating a new
attribute by adding this to your app's [permissions](/dash?t=perms)

```json
{
  "attrs": { "allow": { "$default": "false" } }
}
```

This will prevent any new attributes from being created.

## Specify attributes you want to query.

When you query a namespace, it will return all the attributes for an entity.
We don't currently support specifying which attributes you want to query.

This means if you have private data in an entity, or some larger data you want to fetch sometimes, you'll want to split the entity into multiple namespaces. [Here's an example](https://github.com/instantdb/instant/blob/main/client/sandbox/react-nextjs/pages/patterns/split-attributes.tsx)

## Setting limits via permissions.

If you want to limit the number of entities a user can create, you can do so via
permissions. Here's an example of limiting a user to creating at most 2 todos.

First the [schema](/docs/modeling-data):

```typescript
// instant.schema.ts
// Here we define users, todos, and a link between them.
import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    todos: i.entity({
      label: i.string(),
    }),
  },
  links: {
    userTodos: {
      forward: {
        on: "todos",
        has: "one",
        label: "owner",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "ownedTodos",
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

Then the [permissions](/docs/permissions):

```typescript
import type { InstantRules } from '@instantdb/core';
// instant.perms.ts
// And now we reference the `owner` link for todos to check the number
// of todos a user has created.
// (Note): Make sure the `owner` link is already defined in the schema.
// before you can reference it in the permissions.
const rules = {
  todos: {
    allow: {
      create: "size(data.ref('owner.todos.id')) <= 2",
    },
  },
} satisfies InstantRules;

export default rules;
```

## Listen to InstantDB connection status.

Sometimes you want to let clients know when they are connected or disconnected
to the DB. You can use `db.subscribeConnectionStatus` in vanilla JS or
`db.useConnectionStatus` in React to listen to connection changes

```typescript

// Vanilla JS
const unsub = db.subscribeConnectionStatus((status) => {
 const connectionState =
   status === 'connecting' || status === 'opened'
     ? 'authenticating'
   : status === 'authenticated'
     ? 'connected'
   : status === 'closed'
     ? 'closed'
   : status === 'errored'
     ? 'errored'
   : 'unexpected state';

 console.log('Connection status:', connectionState);
});

// React/React Native
function App() {
 const status = db.useConnectionStatus()
 const connectionState =
   status === 'connecting' || status === 'opened'
     ? 'authenticating'
   : status === 'authenticated'
     ? 'connected'
   : status === 'closed'
     ? 'closed'
   : status === 'errored'
     ? 'errored'
   : 'unexpected state';

 return <div>Connection state: {connectionState}</div>
}
```
