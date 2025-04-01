---
title: Common mistakes
description: Common mistakes when working with Instant
---

Below are some common mistakes when working with Instant

## Common mistakes with schema

❌ **Common mistake**: Reusing the same label for different links

```
// ❌ Bad: Conflicting labels
const _schema = i.schema({
  links: {
    postAuthor: {
      forward: { on: 'posts', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'posts' }, // Creates 'posts' attr
    },
    postEditor: {
      forward: { on: 'posts', has: 'one', label: 'editor' },
      reverse: { on: 'profiles', has: 'many', label: 'posts' }, // Conflicts!
    },
  },
});
```

✅ **Correction**: Use unique labels for each relationship

```
// ✅ Good: Unique labels for each relationship
const _schema = i.schema({
  links: {
    postAuthor: {
      forward: { on: 'posts', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'authoredPosts' }, // Unique
    },
    postEditor: {
      forward: { on: 'posts', has: 'one', label: 'editor' },
      reverse: { on: 'profiles', has: 'many', label: 'editedPosts' }, // Unique
    },
  },
});
```

❌ **Common mistake**: Linking from a system namespace

```
// ❌ Bad: System namespace in forward direction
profileUser: {
  forward: { on: '$users', has: 'one', label: 'profile' },
  reverse: { on: 'profiles', has: 'one', label: '$user' },
},
```

✅ **Correction**: Always link to system namespaces in the reverse direction

```
// ✅ Good: System namespace in reverse direction
profileUser: {
  forward: { on: 'profiles', has: 'one', label: '$user' },
  reverse: { on: '$users', has: 'one', label: 'profile' },
},
```

## Common mistakes with permissions

Sometimes you want to express permissions based an an attribute in a linked entity. For those instance you can use `data.ref`

❌ **Common mistake**: Not using `data.ref` to reference linked data

```
// ❌ Bad: This will throw an error!
{
  "comments": {
    "allow": {
      "update": "auth.id in data.post.author.id
    }
  }
}
```

```
// ✅ Good: Permission based on linked data
{
  "comments": {
    "allow": {
      "update": "auth.id in data.ref('post.author.id')"  // Allow post authors to update comments
    }
  }
}
```

When using `data.ref` the last part of the string is the attribute you want to access. If you do not specify an attribute an error will occur.

❌ **Common mistake**: Not specifying an attribute when using data.ref

```
// ❌ Bad: No attribute specified. This will throw an error!
"view": "auth.id in data.ref('author')"
```

✅ **Correction**: Specify the attribute you want to access

```
// ✅ Good: Correctly using data.ref to reference a linked attribute
"view": "auth.id in data.ref('author.id')"
```

`data.ref` will _ALWAYS_ return a CEL list of linked entities. So we must use the `in` operator to check if a value exists in that list.

❌ **Common mistake**: Using `==` to check if a value exists in a list

```
// ❌ Bad: data.ref returns a list! This will throw an error!
"view": "data.ref('admins.id') == auth.id"
```

✅ **Correction**: Use `in` to check if a value exists in a list

```
✅ Good: Checking if a user is in a list of admins
"view": "auth.id in data.ref('admins.id')"
```

Even if you are referencing a one-to-one relationship, `data.ref` will still return a CEL list. You must extract the first element from the list to compare it properly.

❌ **Common mistake**: Using `==` to check if a value matches in a one-to-one relationship

```
// ❌ Bad: data.ref always returns a CEL list. This will throw an error!
"view": "auth.id == data.ref('owner.id')"
```

✅ **Correction**: Use `in` to check a value even for one-to-one relationships

```
// ✅ Good: Extracting the first element from a one-to-one relationship
"view": "auth.id in data.ref('owner.id')"
```

Be careful when checking whether there are no linked entities. Here are a few correct ways to do this:

❌ **Common mistake**: Incorrectly checking for an empty list

```
// ❌ Bad: `data.ref` returns a CEL list so checking against null will throw an error!
"view": "data.ref('owner.id') != null"

// ❌ Bad: `data.ref` is a CEL list and does not support `length`
"view": "data.ref('owner.id').length > 0"

// ❌ Bad: You must specify an attribute when using `data.ref`
"view": "data.ref('owner') != []"
```

✅ **Correction**: Best way to check for an empty list

```
// ✅ Good: Checking if the list is empty
"view": "data.ref('owner.id') != []"
```

Use `auth.ref` to reference the authenticated user's linked data. This behaves similar to `data.ref` but you _MUST_ use the `$user` prefix when referencing auth data:

❌ **Common mistake**: Missing `$user` prefix with `auth.ref`

```
// ❌ Bad: This will throw an error!
{
  "adminActions": {
    "allow": {
      "create": "'admin' in auth.ref('role.type')"
    }
  }
}
```

✅ **Correction**: Use `$user` prefix with `auth.ref`

```
// ✅ Good: Checking user roles
{
  "adminActions": {
    "allow": {
      "create": "'admin' in auth.ref('$user.role.type')"  // Allow admins only
    }
  }
}
```

`auth.ref` returns a CEL list, so use `[0]` to extract the first element when needed.

❌ **Common mistake**: Using `==` to check if auth.ref matches a value

```
// ❌ Bad: auth.ref returns a list! This will throw an error!
"create": "auth.ref('$user.role.type') == 'admin'"
```

✅ **Correction**: Extract the first element from `auth.ref`

```
// ✅ Good: Extracting the first element from auth.ref
"create": "auth.ref('$user.role.type')[0] == 'admin'"
```

For update operations, you can compare the existing (`data`) and updated (`newData`) values.

One difference between `data.ref` and `newData.ref` is that `newData.ref` does not exist. You can only use `newData` to reference the updated attributes directly.

❌ **Common mistake**: `newData.ref` does not exist.

```
// ❌ Bad: This will throw an error!
// This will throw an error because newData.ref does not exist
{
  "posts": {
    "allow": {
      "update": "auth.id == data.authorId && newData.ref('isPublished') == data.ref('isPublished')"
    }
  }
}
```

❌ **Common mistake**: ref arguments must be string literals

```
// ❌ Bad: This will throw an error!
"view": "auth.id in data.ref(someVariable + '.members.id')"
```

✅ **Correction**: Only string literals are allowed

```
// ✅ Good: Using string literals for ref arguments
"view": "auth.id in data.ref('team.members.id')"
```

## Common mistakes with transactions

Always use `update` method to create new entities:

❌ **Common mistake**: Using a non-existent `create` method

```
// ❌ Bad: `create` does not exist, use `update` instead!
db.transact(db.tx.todos[id()].create({ text: "Buy groceries" }));
```

✅ **Correction**: Use `update` to create new entities

```
// ✅ Good: Always use `update` to create new entities
db.transact(db.tx.todos[id()].update({
  text: "Properly generated ID todo"
}));
```

Use `merge` for updating nested objects without overwriting unspecified fields:

❌ **Common mistake**: Using `update` for nested objects

```typescript
// ❌ Bad: This will overwrite the entire preferences object
db.transact(
  db.tx.profiles[userId].update({
    preferences: { theme: 'dark' }, // Any other preferences will be lost
  }),
);
```

✅ **Correction**: Use `merge` to update nested objects

```
// ✅ Good: Update nested values without losing other data
db.transact(db.tx.profiles[userId].merge({
  preferences: {
    theme: "dark"
  }
}));
```

You can use `merge` to remove keys from nested objects by setting the key to `null`:

❌ **Common mistake**: Calling `update` instead of `merge` for removing keys

```
// ❌ Bad: Calling `update` will overwrite the entire preferences object
db.transact(db.tx.profiles[userId].update({
  preferences: {
    notifications: null
  }
}));
```

✅ **Correction**: Use `merge` to remove keys from nested objects

```
// ✅ Good: Remove a nested key
db.transact(db.tx.profiles[userId].merge({
  preferences: {
    notifications: null  // This will remove the notifications key
  }
}));
```

Large transactions can lead to timeouts. To avoid this, break them into smaller batches:

❌ **Common mistake**: Not batching large transactions leads to timeouts

```typescript
import { id } from '@instantdb/react';

const txs = [];
for (let i = 0; i < 1000; i++) {
  txs.push(
    db.tx.todos[id()].update({
      text: `Todo ${i}`,
      done: false,
    }),
  );
}

// ❌ Bad: This will likely lead to a timeout!
await db.transact(txs);
```

❌ **Common mistake**: Creating too many transactions will also lead to timeouts

```typescript
import { id } from '@instantdb/react';

// ❌ Bad: This fire 1000 transactions at once and will lead to multiple
timeouts!;
for (let i = 0; i < 1000; i++) {
  db.transact(
    db.tx.todos[id()].update({
      text: `Todo ${i}`,
      done: false,
    }),
  );
}

await db.transact(txs);
```

✅ **Correction**: Batch large transactions into smaller ones

```
// ✅ Good: Batch large operations
import { id } from '@instantdb/react';

const batchSize = 100;
const createManyTodos = async (count) => {
  for (let i = 0; i < count; i += batchSize) {
    const batch = [];

    // Create up to batchSize transactions
    for (let j = 0; j < batchSize && i + j < count; j++) {
      batch.push(
        db.tx.todos[id()].update({
          text: `Todo ${i + j}`,
          done: false
        })
      );
    }

    // Execute this batch
    await db.transact(batch);
  }
};

// Create 1000 todos in batches
createManyTodos(1000);
```

## Common mistakes with queries

Nest namespaces to fetch associated entities:

❌ **Common mistake**: Not nesting namespaces will fetch unrelated entities

```
// ❌ Bad: This will fetch all todos and all goals instead of todos associated with their goals
const query = { goals: {}, todos: {} };
```

✅ **Correction**: Nest namespaces to fetch associated entities

```
// ✅ Good: Fetch goals and their associated todos
const query = { goals: { todos: {} };
```

Use `where` operator to filter entities:

❌ **Common mistake**: Placing `where` at the wrong level

```typescript
// ❌ Bad: Filter must be inside $
const query = {
  goals: {
    where: { id: 'goal-1' },
  },
};
```

✅ **Correction**: Place `where` inside the `$` operator

```typescript
// ✅ Good: Fetch a specific goal by ID
const query = {
  goals: {
    $: {
      where: {
        id: 'goal-1',
      },
    },
  },
};
```

`where` operators support filtering entities based on associated values

❌ **Common mistake**: Incorrect syntax for filtering on associated values

```
// ❌ Bad: This will return an error!
const query = {
  goals: {
    $: {
      where: {
        todos: { title: 'Go running' }, // Wrong: use dot notation instead
      },
    },
  },
};
```

✅ **Correction**: Use dot notation to filter on associated values

```
// ✅ Good: Find goals that have todos with a specific title
const query = {
  goals: {
    $: {
      where: {
        'todos.title': 'Go running',
      },
    },
    todos: {},
  },
};
```

Use `or` inside of `where` to filter associated based on any criteria.

❌ **Common mistake**: Incorrect synax for `or` and `and`

```typescript
// ❌ Bad: This will return an error!
const query = {
  todos: {
    $: {
      where: {
        or: { priority: 'high', dueDate: { $lt: tomorrow } }, // Wrong: 'or' takes an array
      },
    },
  },
};
```

✅ **Correction**: Use an array for `or` and `and` operators

```typescript
// ✅ Good: Find todos that are either high priority OR due soon
const query = {
  todos: {
    $: {
      where: {
        or: [{ priority: 'high' }, { dueDate: { $lt: tomorrow } }],
      },
    },
  },
};
```

Using `$gt`, `$lt`, `$gte`, or `$lte` is supported on indexed attributes with checked types:

❌ **Common mistake**: Using comparison on non-indexed attributes

```typescript
// ❌ Bad: Attribute must be indexed for comparison operators
const query = {
  todos: {
    $: {
      where: {
        nonIndexedAttr: { $gt: 5 }, // Will fail if attr isn't indexed
      },
    },
  },
};
```

✅ **Correction**: Use comparison operators on indexed attributes

```typescript
// ✅ Good: Find todos that take more than 2 hours
const query = {
  todos: {
    $: {
      where: {
        timeEstimate: { $gt: 2 },
      },
    },
  },
};

// Available operators: $gt, $lt, $gte, $lte
```

Use `limit` and/or `offset` for simple pagination:

❌ **Common mistake**: Using limit in nested namespaces

```typescript
// ❌ Bad: Limit only works on top-level namespaces. This will return an error!
const query = {
  goals: {
    todos: {
      $: { limit: 5 }, // This won't work
    },
  },
};
```

✅ **Correction**: Use limit on top-level namespaces

```typescript
// ✅ Good: Get first 10 todos
const query = {
  todos: {
    $: {
      limit: 10,
    },
  },
};

// ✅ Good: Get next 10 todos
const query = {
  todos: {
    $: {
      limit: 10,
      offset: 10,
    },
  },
};
```

Use the `order` operator to sort results

❌ **Common mistake**: Using `orderBy` instead of `order`

```typescript
// ❌ Bad: `orderBy` is not a valid operator. This will return an error!
const query = {
  todos: {
    $: {
      orderBy: {
        serverCreatedAt: 'desc',
      },
    },
  },
};
```

✅ **Correction**: Use `order` to sort results

```typescript
// ✅ Good: Sort by creation time in descending order
const query = {
  todos: {
    $: {
      order: {
        serverCreatedAt: 'desc',
      },
    },
  },
};
```

❌ **Common mistake**: Ordering non-indexed fields

```typescript
// ❌ Bad: Field must be indexed for ordering
const query = {
  todos: {
    $: {
      order: {
        nonIndexedField: 'desc', // Will fail if field isn't indexed
      },
    },
  },
};
```

## Common mistakes with Instant on the backend

Use `db.query` in the admin SDK instead of `db.useQuery`. It is an async API without loading states. We wrap queries in try catch blocks to handle errors. Unlike the client SDK, queries in the admin SDK bypass permission checks

❌ **Common mistake**: Using `db.useQuery` in the admin SDK

```javascript
// ❌ Bad: Don't use useQuery on the server
const { data, isLoading, error } = db.useQuery({ todos: {} }); // Wrong approach!
```

✅ **Correction**: Use `db.query` in the admin SDK

```javascript
// ✅ Good: Server-side querying
const fetchTodos = async () => {
  try {
    const data = await db.query({ todos: {} });
    const { todos } = data;
    console.log(`Found ${todos.length} todos`);
    return todos;
  } catch (error) {
    console.error('Error fetching todos:', error);
    throw error;
  }
};
```

## Common mistakes using `$users` namespace

Since the `$users` namespace is read-only and can't be modified directly, it's recommended to create a `profiles` namespace for storing additional user information.

❌ **Common mistake**: Adding properties to `$users` directly

```typescript
// ❌ Bad: Directly updating $users will throw an error!
db.transact(db.tx.$users[userId].update({ nickname: 'Alice' }));
```

✅ **Correction**: Add properties to a linked profile instead

```
// ✅ Good: Update linked profile instead
db.transact(db.tx.profiles[profileId].update({ displayName: "Alice" }));
```

`$users` is a system namespace so we ensure to create links in the reverse direction.

❌ **Common mistake**: Placing `$users` in the forward direction

```typescript
// ❌ Bad: $users must be in the reverse direction
userProfiles: {
  forward: { on: '$users', has: 'one', label: 'profile' },
  reverse: { on: 'profiles', has: 'one', label: '$user' },
},
```

✅ **Correction**: Always link `$users` in the reverse direction

```
// ✅ Good: Create link between profiles and $users
userProfiles: {
  forward: { on: 'profiles', has: 'one', label: '$user' },
  reverse: { on: '$users', has: 'one', label: 'profile' },
},
```

The default permissions only allow users to view their own data. We recommend keeping it this way for security reasons. Instead of viewing all users, you can view all profiles

❌ **Common mistake**: Directly querying $users

```typescript
// ❌ Bad: This will likely only return the current user
db.useQuery({ $users: {} });
```

✅ **Correction**: Directly query the profiles namespace

```typescript
// ✅ Good: View all profiles
db.useQuery({ profiles: {} });
```

## Common mistakes with auth

InstantDB does not provide built-in username/password authentication.

❌ **Common mistake**: Using password-based authentication in client-side code

✅ **Correction**: Use Instant's magic code or OAuth flows instead in client-side code

If you need traditional password-based authentication, you must implement it as a custom auth flow using the Admin SDK.
