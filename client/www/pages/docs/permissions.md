---
title: Permissions
description: How to secure your data with Instant's Rule Language.
---

To secure user data, you can use Instant’s Rule Language. Our rule language
takes inspiration from Rails’ ActiveRecord, Google’s CEL, and JSON.
Here’s an example ruleset below

<!-- prettier-ignore-start -->
```tsx {% showCopy=true %}
// instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  "todos": {
    "allow": {
      "view": "auth.id != null",
      "create": "isOwner",
      "update": "isOwner && isStillOwner",
      "delete": "isOwner",
    },
    "bind": [
      "isOwner", "auth.id != null && auth.id == data.creatorId",
      "isStillOwner", "auth.id != null && auth.id == newData.creatorId"
    ]
  }
} satisfies InstantRules;

export default rules;
```
<!-- prettier-ignore-end -->

You can manage permissions via configuration files or through the Instant dashboard.

## Permissions as code

With Instant you can define your permissions in code. If you haven't already, use the [CLI](/docs/cli) to generate an `instant.perms.ts` file:

```shell {% showCopy=true %}
npx instant-cli@latest init
```

The CLI will guide you through picking an Instant app and generate these files for you. Once you've made changes to `instant.perms.ts`, you can use the CLI to push those changes to production:

```shell {% showCopy=true %}
npx instant-cli@latest push perms
```

## Permissions in the dashboard

For each app in your dashboard, you’ll see a permissions editor. Permissions are expressed as JSON. Each top level key represents one of your namespaces — for example `goals`, `todos`, and the like. There is also a special top-level key `attrs` for defining permissions on creating new types of namespaces and attributes.

## Namespaces

For each namespace you can define `allow` rules for `view`, `create`, `update`, `delete`. Rules must be boolean expressions.

If a rule is not set then by default it evaluates to true. The following three rulesets are all equivalent

In this example we explicitly set each action for `todos` to true

```json
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

In this example we explicitly set `view` to be true. However, all the remaining
actions for `todo` also default to true.

```json
{
  "todos": {
    "allow": {
      "view": "true"
    }
  }
}
```

In this example we set no rules, and thus all permission checks pass.

```json
{}
```

{% callout type="warning" %}

When you start developing you probably won't worry about permissions. However, once you start shipping your app to users you will want to secure their data!

{% /callout %}

### View

`view` rules are evaluated when doing `db.useQuery`. On the backend every object
that satisfies a query will run through the `view` rule before being passed back
to the client. This means as a developer you can ensure that no matter what query
a user executes, they’ll _only_ see data that they are allowed to see.

### Create, Update, Delete

Similarly, for each object in a transaction, we make sure to evaluate the respective `create`, `update`, and `delete` rule.
Transactions will fail if a user does not have adequate permission.

### Default permissions

By default, all permissions are considered to be `"true"`. To change that, use `"$default"` key. This:

```json
{
  "todos": {
    "allow": {
      "$default": "false"
    }
  }
}
```

is equivalent to this:

```json
{
  "todos": {
    "allow": {
      "view": "false",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  }
}
```

Specific keys can override defaults:

```json
{
  "todos": {
    "allow": {
      "$default": "false",
      "view": "true"
    }
  }
}
```

You can use `$default` as the namespace:

```json
{
  "$default": {
    "allow": {
      "view": "false"
    }
  },
  "todos": {
    "allow": {
      "view": "true"
    }
  }
}
```

Finally, the ultimate default:

```json
{
  "$default": {
    "allow": {
      "$default": "false"
    }
  }
}
```

## Attrs

Attrs are a special kind of namespace for creating new types of data on the fly.
Currently we only support creating attrs. During development you likely don't
need to lock this rule down, but once you ship you will likely want to set this
permission to `false`

Suppose our data model looks like this

```json
{
  "goals": { "id": UUID, "title": string }
}
```

And we have a rules defined as

```json
{
  "attrs": { "allow": { "create": "false" } }
}
```

Then we could create goals with existing attr types:

```javascript
db.transact(db.tx.goals[id()].update({title: "Hello World"})
```

But we would not be able to create goals with new attr types:

```javascript
db.transact(db.tx.goals[id()].update({title: "Hello World", priority: "high"})
```

## CEL expressions

Inside each rule, you can write CEL code that evaluates to either `true` or `false`.

```json
{
  "todos": {
    "allow": {
      "view": "auth.id != null",
      "create": "auth.id in data.ref('creator.id')",
      "update": "!(newData.title == data.title)",
      "delete": "'joe@instantdb.com' in data.ref('users.email')"
    }
  }
}
```

The above example shows a taste of the kind of rules you can write :)

### data

`data` refers to the object you have saved. This will be populated when used for `view`, `create`, `update`, and `delete` rules

### newData

In `update`, you'll also have access to `newData`. This refers to the changes that are being made to the object.

### bind

`bind` allows you to alias logic. The following are equivalent

```json
{
  "todos": {
    "allow": {
      "create": "isOwner"
    },
    "bind": ["isOwner", "auth.id != null && auth.id == data.creatorId"]
  }
}
```

```json
{
  "todos": {
    "allow": {
      "create": "auth.id != null && auth.id == data.creatorId"
    }
  }
}
```

`bind` is useful for not repeating yourself and tidying up rules

```json
{
  "todos": {
    "allow": {
      "create": "isOwner || isAdmin"
    },
    "bind": [
      "isOwner",
      "auth.id != null && auth.id == data.creatorId",
      "isAdmin",
      "auth.email in ['joe@instantdb.com', 'stopa@instantdb.com']"
    ]
  }
}
```

### ref

You can also refer to relations in your permission checks. This rule restricts
delete to only succeed on todos associated with a specific user email.

```json
{
  "todos": {
    "allow": {
      "delete": "'joe@instantdb.com' in data.ref('users.email')"
    }
  }
}
```

`ref` works on the `auth` object too. Here's how you could restrict `deletes` to users with the 'admin' role:

```json
{
  "todos": {
    "allow": {
      "delete": "'admin' in auth.ref('$user.role.type')"
    },
  },
};
```

See [managing users](/docs/users) to learn more about that.

### ruleParams

Imagine you have a `documents` namespace, and want to implement a rule like _"Only people who know my document's id can access it."_

You can use `ruleParams` to write that rule. `ruleParams` let you pass extra options to your queries and transactions.

For example, pass a `knownDocId` param to our query:

```javascript
// You could get your doc's id from the URL for example
const myDocId = getId(window.location);

const query = {
  docs: {},
};
const { data } = db.useQuery(query, {
  ruleParams: { knownDocId: myDocId }, // Pass the id to ruleParams!
});
```

Or to your transactions:

```js
db.transact(
  db.tx.docs[id].ruleParams({ knownDocId: id }).update({ title: 'eat' }),
);
```

And then use it in your permission rules:

```json
{
  "documents": {
    "allow": {
      "view": "data.id == ruleParams.knownDocId",
      "update": "data.id == ruleParams.knownDocId",
      "delete": "data.id == ruleParams.knownDocId"
    }
  }
}
```

With that, you've implemented the rule _"Only people who know my document's id can access it."_!

**Here are some more patterns**

If you want to: access a document and _all related comments_ by one `knownDocId`:

```json
{
  "docs": {
    "view": "data.id == ruleParams.knownDocId"
  },
  "comment": {
    "view": "ruleParams.knownDocId in data.ref('parent.id')"
  }
}
```

Or, if you want to allow multiple documents:

```js
db.useQuery(..., { knownDocIds: [id1, id2, ...] })
```

```json
{
  "docs": {
    "view": "data.id in ruleParams.knownDocIds"
  }
}
```

To create a “share links” feature, where you have multiple links to the same doc, you can create a separate namespace:

```json
{
  "docs": {
    "view": "ruleParams.secret in data.ref('docLinks.secret')"
  }
}
```

Or if you want to separate “view links” from “edit links”, you can use two namespaces like this:

```json
{
  "docs": {
    "view": "hasViewerSecret || hasEditorSecret",
    "update": "hasEditorSecret",
    "delete": "hasEditorSecret",
    "bind": [
      "hasViewerSecret",
      "ruleParams.secret in data.ref('docViewLinks.secret')",
      "hasEditorSecret",
      "ruleParams.secret in data.ref('docEditLinks.secret')"
    ]
  }
}
```
