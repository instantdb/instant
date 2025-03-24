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

Right now `$users` is a read-only namespace. You can override the `view`
permission to whatever you like, but `create`, `delete`, and `update`
are restricted.

## Adding properties

Although you cannot directly add properties to the `$users` namespace, you can
create links to other namespaces. Here is an example of a schema for a todo app that has users,
roles, profiles, and todos:

```javascript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.any().unique().indexed(),
    }),
    profiles: i.entity({
      nickname: i.string(), // We can't add this directly to `$users`
      userId: i.string().unique(),
    }),
    roles: i.entity({
      type: i.string().unique(), // We couldn't add this directly to `$users` either
    }),
    todos: i.entity({
      text: i.string(),
      userId: i.string(),
      completed: i.boolean(),
    }),
  },
  links: {
    // `$users` is in the reverse direction for all these links!
    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'todos'},
    },
    userRoles: {
      forward: { on: 'roles', has: 'many', label: 'users' },
      reverse: { on: '$users', has: 'one', label: 'role' },
    },
    userProfiles: {
      forward: { on: 'profiles', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
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

We created three links `todoOwner`, `userRoles`, and `userProfiles` to link the `$users`
namespace to the `todos`, `roles`, and `profiles` namespaces respectively:

```typescript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  // ..
  links: {
    // `$users` is in the reverse direction for all these links!
    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'todos' },
    },
    userRoles: {
      forward: { on: 'roles', has: 'many', label: 'users' },
      reverse: { on: '$users', has: 'one', label: 'role' },
    },
    userProfiles: {
      forward: { on: 'profiles', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
  },
});
```

Notice that the `$users` namespace is in the reverse direction for all links. If you try to create a link with `$users` in the forward direction, you'll get an error.

### Attributes

Now take a look at the `profiles` namespace:

```typescript
// instant.schema.ts
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    // ...
    profiles: i.entity({
      nickname: i.string(), // We can't add this directly to `$users`
    }),
  },
  // ...
});
```

You may be wondering why we didn't add `nickname` directly to the `$users` namespace. This is
because the `$users` namespace is read-only and we cannot add properties to it.
If you want to add additional properties to a user, you'll need to create a
new namespace and link it to `$users`.

---

Once done, you can include user information in the client like so:

```javascript
// Creates a todo and links the current user as an owner
const addTodo = (newTodo, currentUser) => {
  const newId = id();
  db.transact(
    tx.todos[newId]
      .update({ text: newTodo, userId: currentUser.id, completed: false })
      // Link the todo to the user with the `owner` label we defined in the schema
      .link({ owner: currentUser.id }),
  );
};

// Creates or updates a user profile with a nickname and links it to the
// current user
const updateNick = (newNick, currentUser) => {
  const profileId = lookup('email', currentUser.email);
  db.transact([
    tx.profiles[profileId]
      .update({ userId: currentUser.id, nickname: newNick })
      // Link the profile to the user with the `user` label we defined in the schema
      .link({ user: currentUser.id }),
  ]);
};
```

If attr creation on the client [is enabled](/docs/permissions#attrs),
you can also create new links without having to define them in the schema. In
this case you can only link to `$users` and not from `$users`.

```javascript
// Comments is a new namespace! We haven't defined it in the schema.

// ✅ This works!
const commentId = id()
db.transact(
  tx.comments[commentId].update({ text: 'Hello world', userId: currentUser.id })
    .link({ $user: currentUser.id }));

// ❌ This will not work! Cannot create a forward link on the fly
const commentId = id()
db.transact([
  tx.comments[id()].update({ text: 'Hello world', userId: currentUser.id }),
  tx.$users[currentUser.id].link({ comment: commentId }))]);

// ❌ This will also not work! Cannot create new properties on `$users`
db.transact(tx.$users[currentUser.id].update({ nickname: "Alyssa" }))
```

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
      "'admin' in auth.ref('$user.role.type')",
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
