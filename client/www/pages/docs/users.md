---
title: Managing users
description: How to manage users in your Instant app.
---

## See users in your app

You can manage users in your app using the `$users` namespace. This namespace is
automatically created when you create an app.

You'll see the `$users` namespace in the `Explorer` tab with all
the users in your app!

## Querying users

The `$users` namespace can be queried like any normal namespace. However, we've
set some default permissions so that only a logged-in user can view their own
data.

```javascript
// instant.perms.ts
import type { InstantRules } from "@instantdb/react";

const rules = {
  $users: {
    allow: {
      view: 'auth.id == data.id',
      create: 'false',
      delete: 'false',
      update: 'false',
    },
  },
} satisfies InstantRules;

export default rules;
```

Since `$users` is a managed namespace, you can override `view` and `update` rules, but not `create` or `delete`. These are handled by the Instant backend.

## Sharing user data

If you want to make the users table public, you can always change the `view` permission. If you do this, be sure to write an appropriate `field` permission on `emails` so that those columns don't leak.

```javascript
// instant.perms.ts
import type { InstantRules } from "@instantdb/react";

const rules = {
  $users: {
    allow: {
      view: 'true', // anyone can see users
      create: 'false',
      delete: 'false',
      update: 'false',
    },
    fields: {
      email: "auth.id == data.id" // but only the logged in user can see their own email.
    }
  },
} satisfies InstantRules;

export default rules;
```

## Adding properties

You can add optional properties on the `$users` table. Here is an example of a schema for a todo app where users have nicknames and roles:

```javascript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.any().unique().indexed(),
      nickname: i.string().optional(), // Users now have a `nickname` property
    }),
    roles: i.entity({
      type: i.string().indexed(),
    }),
    todos: i.entity({
      text: i.string(),
      completed: i.boolean(),
    }),
  },
  links: {
    userRoles: {
      forward: { on: '$users', has: 'many', label: 'roles' },
      reverse: { on: 'roles', has: 'many', label: 'users' },
    },
    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'todos'},
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

### Links

We created two links `userRoles`, `todoOwner`:

```typescript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  // ..
  links: {
    userRoles: {
      forward: { on: '$users', has: 'many', label: 'roles' },
      reverse: { on: 'roles', has: 'many', label: 'users' },
    },
    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'todos' },
    },
  },
});
```

Notice that none of the links are required. You can't require links for `$users`.

### Attributes

Now look at the `nickname` attribute we just added:

```typescript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.any().unique().indexed(),
      nickname: i.string().optional(), // Users now have a `nickname` property
    }),
  },
  // ...
});
```

Note that `nickname` is optional too. New columns on `$users` have to be optional.

---

Once done, you can include user information in the client like so:

```javascript
// Creates a todo and links the current user as an owner
const addTodo = (newTodo, currentUser) => {
  const newId = id();
  db.transact(
    db.tx.todos[newId]
      .update({ text: newTodo, completed: false })
      // Link the todo to the user with the `owner` label we defined in the schema
      .link({ owner: currentUser.id }),
  );
};

// Creates or updates a user profile with a nickname and links it to the
// current user
const updateNick = (newNick, currentUser) => {
  db.transact([db.tx.$users[currentUser.id].update({ nickname: newNick })]);
};
```

At the moment you can use `transact` to update the custom properties you added. Changing `email` would cause the transaction to fail.

## User permissions

You can reference the `$users` namespace in your permission rules just like a
normal namespace. For example, you can restrict a user to only update their own
todos like so:

```javascript
export default {
  // users perms...
  todos: {
    allow: {
      // owner is the label from the todos namespace to the $users namespace
      update: "auth.id in data.ref('owner.id')",
    },
  },
};
```

You can also traverse the `$users` namespace directly from the `auth` object via
`auth.ref`. When using `auth.ref` the arg must start with `$user`. Here's the
equivalent rule to the one above using `auth.ref`:

```javascript
export default {
  // users perms...
  todos: {
    allow: {
      // We traverse the users links directly from the auth object
      update: "data.id in auth.ref('$user.todos.id')",
    },
  },
};
```

By creating links to `$users` and leveraging `auth.ref`, you can expressively build
more complex permission rules.

```javascript
export default {
  // users perms...
  todos: {
    bind: [
      'isAdmin',
      "'admin' in auth.ref('$user.roles.type')",
      'isOwner',
      "data.id in auth.ref('$user.todos.id')",
    ],
    allow: {
      // We traverse the users links directly from the auth object
      update: 'isAdmin || isOwner',
    },
  },
};
```
