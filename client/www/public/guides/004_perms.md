# InstantDB Permissions Guide

This guide explains how to use InstantDB's Rule Language to secure your application data and implement proper access controls.

## Core Concepts

InstantDB's permission language is built on top of [Google's Common Expression Language
(CEL)](https://github.com/google/cel-spec/blob/master/doc/langdef.md) and allows you to define rules for viewing, creating, updating, and
deleting data.

At a high level, rules define permissions for four operations on a namespace

- **view**: Controls who can read data (used during queries)
- **create**: Controls who can create new entities
- **update**: Controls who can modify existing entities
- **delete**: Controls who can remove entities

## Rules Strucutre

Rules are defined in the `instant.perms.ts` file and follow a specific structure. Below is the JSON schema for the rules:

```typscript
export const rulesSchema = {
  type: 'object',
  patternProperties: {
    '^[$a-zA-Z0-9_\\-]+$': {
      type: 'object',
      properties: {
        allow: {
          type: 'object',
          properties: {
            create: { type: 'string' },
            update: { type: 'string' },
            delete: { type: 'string' },
            view: { type: 'string' },
            $default: { type: 'string' },
          },
          additionalProperties: false,
        },
        bind: {
          type: 'array',
          // Use a combination of "items" and "additionalItems" for validation
          items: { type: 'string' },
          minItems: 2,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
```

## Setting Up Permissions

To set up permissions:

1. Generate an `instant.perms.ts` file at the project root:
   ```bash
   npx instant-cli@latest init
   ```

2. Edit the file with your permission rules. Here is an example for a personal
   todo app:

```typescript
// ✅ Good: Define permissions in instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  todos: {
    allow: {
      view: 'auth.id != null',          // Only authenticated users can view
      create: 'isOwner',                // Only owner can create
      update: 'isOwner',                // Only owner can update
      delete: 'isOwner',                // Only owner can delete
    },
    bind: ['isOwner', 'auth.id != null && auth.id == data.creatorId'],
  },
} satisfies InstantRules;

export default rules;
```

3. Push your changes to production:
   ```bash
   npx instant-cli@latest push perms
   ```

## Default Permission Behavior

By default, all permissions are set to `true` (unrestricted access). If a rule is not explicitly defined, it defaults to allowing the operation.

```
// ✅ Good: Explicitly defining all permissions
{
  "todos": {
    "allow": {
      "view": "true",
      "create": "true",
      "update": "true",
      "delete": "true"
    }
  }
}
```

This is equivalent to:

```
{
  "todos": {
    "allow": {
      "view": "true"
      // create, update, delete default to true
    }
  }
}
```

And also equivalent to:

```
// Empty rules = all permissions allowed
{}
```

## Using `$default` in a namespaces

You can explicitly set default rules for all operations within a namespace with
the `$default` keyword:

```
// Deny all permissions by default, then explicitly allow some
{
  "todos": {
    "allow": {
      "$default": "false",       // Default deny all operations
      "view": "auth.id != null"  // But allow viewing for authenticated users
    }
  }
}
```

## Using `auth` and `data` in rules

The `auth` object represents the authenticated user and `data` represents the
current entity being accessed. You can use these objects to create dynamic
rules:

```
// ✅ Good: Using auth and data in rules
{
  "todos": {
    "allow": {
      "view": "auth.id != null",                                // Only authenticated users can view
      "create": "auth.id != null",                              // Only authenticated users can create
      "update": "auth.id != null && auth.id == data.ownerId",   // Only the owner can update
      "delete": "auth.id != null && auth.id == data.ownerId"    // Only the owner can delete
    }
  }
}
```

## Use `bind` for reusable logic

The `bind` feature lets you create aliases and reusable logic for your rules.

Bind is an array of strings where each pair of strings defines a name and its
corresponding expression. You can then reference these names in both `allow` and
in other bind expressions.

Combining bind with `$default` can make writing permission rules much easier:

```
// ✅ Good: Use bind to succinctly define permissions
{
  "todos": {
    "allow": {
      "view": "isLoggedIn",
      "$default": "isOwner || isAdmin", // You can even use `bind` with `$default`
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      "isOwner", "isLoggedIn && auth.id == data.ownerId",
      "isAdmin", "isLoggedIn && auth.email in ['admin@example.com', 'support@example.com']"
    ]
  }
}
```

## Use `data.ref` for linked data

Sometimes you want to express permissions based an an attribute in a linked entity. For those instance you can use `data.ref`

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

When using `data.ref` the last part of the string is the attribute you want to
access. If you do not specify an attribute an error will occur.

```
// ✅ Good: Correctly using data.ref to reference a linked attribute
"view": "auth.id in data.ref('author.id')"
```

❌ **Common mistake**: Not specifying an attribute when using data.ref
```
// ❌ Bad: No attribute specified. This will throw an error!
"view": "auth.id in data.ref('author')"
```

`data.ref` will *ALWAYS* return a CEL list of linked entities. So we must use the
`in` operator to check if a value exists in that list.

```
✅ Good: Checking if a user is in a list of admins
"view": "auth.id in data.ref('admins.id')"
```

❌ **Common mistake**: Using `==` to check if a value exists in a list
```
// ❌ Bad: data.ref returns a list! This will throw an error!
"view": "data.ref('admins.id') == auth.id"
```

Even if you are referencing a one-to-one relationship, `data.ref` will still return a CEL list. You must extract the first element from the list to compare it properly.

```
// ✅ Good: Extracting the first element from a one-to-one relationship
"view": "auth.id == data.ref('owner.id')[0]"
```

❌ **Common mistake**: Using `==` to check if a value matches in a one-to-one relationship
```
// ❌ Bad: data.ref always returns a CEL list. This will throw an error!
"view": "auth.id == data.ref('owner.id')"
```

Be careful when checking whether there are no linked entities. Here are a few
correct ways to do this:

```
// ✅ Good: Extracting the first element from a CEL list to check if it's empty
"view": "data.ref('owner.id')[0] != null"

// ✅ Good: Checking if the list is empty
"view": "data.ref('owner.id') != []"

// ✅ Good: Check the size of the list
"view": "size(data.ref('owner.id')) > 0"
```

❌ **Common mistake**: Incorrectly checking for an empty list
```
// ❌ Bad: `data.ref` returns a CEL list so checking against null will throw an error!
"view": "data.ref('owner.id') != null"

// ❌ Bad: `data.ref` is a CEL list and does not support `length`
"view": "data.ref('owner.id').length > 0"

// ❌ Bad: You must specify an attribute when using `data.ref`
"view": "data.ref('owner') != []"
```

## Using `auth.ref` for data linked to the current user

Use `auth.ref` to reference the authenticated user's linked data. This behaves
similar to `data.ref` but you *MUST* use the `$user` prefix when referencing auth data:

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

`auth.ref` returns a CEL list, so use `[0]` to extract the first element when needed.

```
// ✅ Good: Extracting the first element from auth.ref
"create": "auth.ref('$user.role.type')[0] == 'admin'"
```

❌ **Common mistake**: Using `==` to check if auth.ref matches a value
```
// ❌ Bad: auth.ref returns a list! This will throw an error!
"create": "auth.ref('$user.role.type') == 'admin'"
```

## Using `newData` to compare old and new data

For update operations, you can compare the existing (`data`) and updated (`newData`) values:

```
// ✅ Good: Conditionally allowing updates based on changes
{
  "posts": {
    "allow": {
      "update": "auth.id == data.authorId && newData.isPublished == data.isPublished"
      // Authors can update their posts, but can't change the published status
    }
  }
}
```

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

## Use `ruleParams` for non-auth based permissions

Use `ruleParams` to implement non-auth based permissions like "only people who know my document id can access it"

```typescript
// app/page.tsx
// ✅ Good: Pass along an object containing docId to `useQuery` or `transact` via `ruleParams`
const docId = new URLSearchParams(window.location.search).get("docId")

const query = {
  docs: {},
};
const { data } = db.useQuery(query, {
  ruleParams: { docId }, // Pass the id to ruleParams!
});

// and/or in your transactions:

db.transact(
  db.tx.docs[docId].ruleParams({ docId }).update({ title: 'eat' }),
);
```

```
// instant.perms.ts
// ✅ Good: And then use ruleParams in your permission rules
{
  "documents": {
    "allow": {
      "view": "data.id == ruleParams.docId",
      "update": "data.id == ruleParams.docId",
      "delete": "data.id == ruleParams.docId"
    }
  }
}
```

### `ruleParams` with linked data

You can check `ruleParams` against linked data too

```
// ✅ Good: We can view all comments for a doc if we know the doc id
{
  "comment": {
    "view": "ruleParams.docId in data.ref('doc.id')"
  }
}
```

### `ruleParams` with a list of values

You use a list as the value for a key to `ruleParams` and it will be treated
like a CEL list in permissions

```typescript
// app/page.tsx
// ✅ Good: Pass a list of docIds
db.useQuery({ docs: {} }, { docIds: [id1, id2, ...] })

// instant.perms.ts
{
  "docs": {
    "view": "data.id in ruleParams.docIds"
  }
}
```

## Common Mistakes

Below are some more common mistakes to avoid when writing permission rules:

❌ **Common mistake**: ref arguments must be string literals
```
// ❌ Bad: This will throw an error!
"view": "auth.id in data.ref(someVariable + '.members.id')"
```

✅ **Correction**: Only string literals are allowed
```
"view": "auth.id in data.ref('team.members.id')"
```

## Permission Examples

Below are some permission examples for different types of applications:

### Blog Platform

```typescript
// ✅ Good: Blog platform permissions in instant.perms.ts
import type { InstantRules } from '@instantdb/react';

{
  "posts": {
    "allow": {
      "view": "data.isPublished || isAuthor",                        // Public can see published posts, author can see drafts
      "create": "auth.id != null && isAuthor",                       // Authors can create posts
      "update": "isAuthor || isAdmin",                               // Author or admin can update
      "delete": "isAuthor || isAdmin"                                // Author or admin can delete
    },
    "bind": [
      "isAuthor", "auth.id == data.authorId",
      "isAdmin", "auth.ref('$user.role')[0] == 'admin'"
    ]
  },
  "comments": {
    "allow": {
      "view": "true",
      "create": "isCommentAuthor",
      "update": "isCommentAuthor",
      "delete": "isCommentAuthor || isPostAuthor || isAdmin"
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      "isPostAuthor", "isLoggedIn && auth.id == data.ref('post.authorId')",
      "isCommentAuthor", "isLoggedIn && auth.id == data.authorId",
      "isAdmin", "auth.ref('$user.role')[0] == 'admin'"
    ]
  }
} satisfies InstantRules;

export default rules;
```

### Todo App

```typescript
// ✅ Good: Todo app permissions in instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  "todos": {
    "allow": {
      "view": "isOwner || isShared",
      "create": "isOwner",
      "update": "isOwner || (isShared && (data.ownerId == newData.ownerId)", // Owner can do anything, shared users can't change ownership
      "delete": "isOwner"
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      "isShared", "isLoggedIn && auth.id in data.ref('sharedWith.id')",
      "isOwner", "isLoggedIn && auth.id == data.ownerId",
      "isSharedWith", "auth.id in data.ref('sharedWith.id')"
    ]
  },
  "lists": {
    "allow": {
      "$default": "isOwner", // Only owners can create, update, or delete
      "view": "isOwner || isCollaborator" // Owners and collaborators can view
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      "isOwner", "isLoggedIn && auth.id == data.ownerId",
      "isCollaborator", "isLoggedIn && auth.id in data.ref('collaborators.id')"
    ]
  }
} satisfies InstantRules;

export default rules;
```

