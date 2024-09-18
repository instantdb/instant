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
  "attrs": { "allow": { "create": "false" } }
}
```

This will prevent any new attributes from being created.

## Query all users and add additional attributes.

Right now we don't expose the auth table to the client or the dashboard. This
will change in the future. For now we recommend you manage you your own user
namespace. [Here's an example](https://github.com/instantdb/instant/blob/main/client/sandbox/react-nextjs/pages/patterns/manage-users.tsx)

## Specify attributes you want to query.

When you query a namespace, it will return all the attributes for an entity.
We don't currently support specifying which attributes you want to query. This
means if you have private data in an entity, or some larger data you want to
fetch sometimes, you'll want to split the entity into multiple namespaces.
[Here's an example](https://github.com/instantdb/instant/blob/main/client/sandbox/react-nextjs/pages/patterns/split-attributes.tsx)

## Setting limits via permissions.

If you want to limit the number of entities a user can create, you can do so via
permissions. Here's an example of limiting a user to creating at most 2 todos.

```typescript
// instant.schema.ts
// Here we define users, todos, and a link between them.
import { i } from '@instantdb/core';

const graph = i.graph(
  {
    users: i.entity({
      email: i.string(),
    }),
    todos: i.entity({
      label: i.string(),
    }),
  },
  {
    userTodos: {
      forward: {
        on: 'users',
        has: 'many',
        label: 'todos',
      },
      reverse: {
        on: 'todos',
        has: 'one',
        label: 'owner',
      },
    },
  }
);

export default graph;
```

```typescript
// instant.schema.ts
// And now we reference the `owner` link for todos to check the number
// of todos a user has created.
// (Note): Make sure the `owner` link is already defined in the schema.
// before you can reference it in the permissions.
export {
  "todos": {
    "allow": {
      "create": "size(data.ref('owner.todos.id')) <= 2",
    }
  }
}
```
