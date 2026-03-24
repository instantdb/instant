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
set some default permissions.

```javascript
// instant.perms.ts
import type { InstantRules } from "@instantdb/react";

const rules = {
  $users: {
    allow: {
      view: 'auth.id == data.id', // users can only see themselves by default
      create: 'true', // signups are open by default
      delete: 'false', // users can only be deleted via the dashboard or admin SDK
      update: 'false', // users can't update by default
    },
  },
} satisfies InstantRules;

export default rules;
```

Since `$users` is a managed namespace, you can override `view`, `update`, and `create` rules, but not `delete`. The `create` rule runs during signup (not via `transact`) and can be used to restrict who can sign up or validate `extraFields`. See [Signup rules](#signup-rules) for details.

## Sharing user data

If you want to make the users table public, you can always change the `view` permission. If you do this, be sure to write an appropriate `field` permission on `emails` so that those columns don't leak.

```javascript
// instant.perms.ts
import type { InstantRules } from "@instantdb/react";

const rules = {
  $users: {
    allow: {
      view: 'true', // anyone can see users
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

// This helps TypeScript display nicer intellisense
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

Note that `nickname` is optional too. Custom columns on `$users` have to be optional.

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

At the moment you can only use `transact` to update the custom properties you added. Changing default columns like `email` would cause the transaction to fail.

## Setting properties at signup

You can set custom `$users` properties at the moment a user is created by passing `extraFields` to your sign-in method. Fields are only written when the user is first created. Returning users are unaffected.

The fields you pass must be defined in your schema as optional attributes on `$users`.

**Magic codes**

```javascript
db.auth.signInWithMagicCode({
  email: sentEmail,
  code,
  extraFields: { nickname: 'nezaj' },
});
```

**OAuth with ID token** (Google Button, Apple, Clerk, Firebase)

```javascript
db.auth.signInWithIdToken({
  clientName: 'google',
  idToken,
  nonce,
  extraFields: { nickname: 'nezaj' },
});
```

**OAuth with web redirect** (Google, GitHub, LinkedIn)

For the redirect flow, pass `extraFields` when creating the authorization URL. Instant stores them and applies them when the user is created after the redirect.

```javascript
const url = db.auth.createAuthorizationURL({
  clientName: 'google',
  redirectURL: window.location.href,
  extraFields: { nickname: 'nezaj' },
});
```

**OAuth with code exchange** (Expo, React Native)

```javascript
db.auth.exchangeOAuthCode({
  code: res.params.code,
  codeVerifier: request.codeVerifier,
  extraFields: { nickname: 'nezaj' },
});
```

All sign-in methods return a `created` boolean so you can distinguish new users from returning ones. This is useful for scaffolding initial data when a user first signs up:

```javascript
const { user, created } = await db.auth.signInWithMagicCode({
  email,
  code,
  extraFields: { nickname },
});

if (created) {
  // Create default data for the new user
  db.transact([
    db.tx.settings[id()]
      .update({ theme: 'light', notifications: true })
      .link({ user: user.id }),
  ]);
}
```

When using `extraFields`, a `create` rule on `$users` is required. Signup will fail if no rule is defined. This ensures you explicitly opt in to accepting custom fields. A rule of `"true"` allows any values through. See [Signup rules](#signup-rules) for more examples.

## Signup rules

You can write a `create` rule on `$users` to control who can sign up and what fields they can set. This rule runs during the auth signup flow (magic codes, OAuth, guest sign-in) but does not apply to `transact`.

By default, anyone can sign up. If you set a `create` rule, it must pass for signup to succeed. If it fails, no user is created and magic codes are not consumed.

The `create` rule has access to `data` (the user being created, including email and any `extraFields`) and `auth` (set to the same value as `data`). Note that `ref()` is not available since the user has no relationships yet.

**Restrict signups to a domain**

```javascript
{
  "$users": {
    "allow": {
      "create": "data.email.endsWith('@mycompany.com')"
    }
  }
}
```

**Validate extraFields values**

```javascript
{
  "$users": {
    "allow": {
      "create": "data.username == null || data.username.size() >= 3"
    }
  }
}
```

**Disable all signups (waitlist mode)**

```javascript
{
  "$users": {
    "allow": {
      "create": "false"
    }
  }
}
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
    bind: {
      isAdmin: "'admin' in auth.ref('$user.roles.type')",
      isOwner: "data.id in auth.ref('$user.todos.id')",
    },
    allow: {
      // We traverse the users links directly from the auth object
      update: 'isAdmin || isOwner',
    },
  },
};
```
