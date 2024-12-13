---
title: Modeling data
---

In this section we’ll learn how to model data using Instant's schema. By the end of this document you’ll know how to:

- Create entities and attributes
- Add indexes and unique constraints
- Model relationships
- Lock down your schema for production

We’ll build a micro-blog to illustrate; we'll have authors, posts, comments, and tags.

## Schema as Code

With Instant you can define your schema and your permissions in code. If you haven't already, use the [CLI](/docs/cli) to generate an `instant.schema.ts`, and a `instant.perms.ts` file:

```shell {% showCopy=true %}
npx instant-cli@latest init
```

The CLI will guide you through picking an Instant app and generate these files for you.

## instant.schema.ts

Now we can define the data model for our blog!

Open `instant.schema.ts`, and paste the following:

```typescript {% showCopy=true %}
// instant.schema.ts

import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique(),
    }),
    profiles: i.entity({
      nickname: i.string(),
      createdAt: i.date(),
    }),
    posts: i.entity({
      title: i.string(),
      body: i.string(),
      createdAt: i.date(),
    }),
    comments: i.entity({
      body: i.string(),
      createdAt: i.date(),
    }),
    tags: i.entity({
      title: i.string(),
    }),
  },
  links: {
    postAuthor: {
      forward: { on: "posts", has: "one", label: "author" },
      reverse: { on: "profiles", has: "many", label: "authoredPosts" },
    },
    commentPost: {
      forward: { on: "comments", has: "one", label: "post" },
      reverse: { on: "posts", has: "many", label: "comments" },
    },
    commentAuthor: {
      forward: { on: "comments", has: "one", label: "author" },
      reverse: { on: "profiles", has: "many", label: "authoredComments" },
    },
    postsTags: {
      forward: { on: "posts", has: "many", label: "tags" },
      reverse: { on: "tags", has: "many", label: "posts" },
    },
    profileUser: {
      forward: { on: "profiles" has: "one", label: "$user" },
      reverse: { on: "users", has: "one", label: "profile" }
    }
  },
  rooms: {}
});

// This helps Typescript display better intellisense
type _AppSchema = typeof schema;
interface AppSchema extends _AppSchema;
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
```

Let's unpack what we just wrote. There are three core building blocks to model data with Instant: **Entities**, **Attributes**, and **Links**.

## 1) Entities

Entities are equivelant to "tables" in relational databases or "collections" in NoSQL. In our case, these are: `$users`, `profiles`, `posts`, `comments`, and `tags`.

They're all defined in the `entities` section:

```typescript
const _schema = i.schema({
  entities: {
    posts: i.entity({
      // ...
    }),
  },
});
```

## 2) Attributes

Attributes are properties associated with entities. These are equivelant to a "column" in relational databases or a "field" in NoSQL. For the `posts` entity, we have the `title`, `body`, and `createdAt` attributes:

```typescript
posts: i.entity({
  title: i.string(),
  body: i.string(),
  createdAt: i.date(),
})
```

### Typing attributes

Attributes can be typed as `i.string()`, `i.number()`, `i.boolean()`, `i.date()`, `i.json()`, or `i.any()`.

{% callout %}

`i.date()` accepts dates as either a numeric timestamp (in milliseconds) or an ISO 8601 string. `JSON.stringify(new Date())` will return an ISO 8601 string.

{% /callout %}

Instant will make sure that all data conforms to these attributes, and you'll get the proper typescript hints to boot!

### Unique constraints

Sometimes you'll want to introduce a unique constraint. For example, consider `$users.email`:

```typescript
$users: i.entity({
  email: i.string().unique(),
}),
```

No two users should have the same email. If we mark `email` as `unique`, Instant will guarantee this constraint for us.

Plus unique attributes come with their own special index, which make queries that use them fast:

```typescript
const query = {
  $users: {
    $: {
      where: {
        // Since `email` is unique, this query is 🚀 fast
        email: 'alyssa_p_hacker@instantdb.com',
      },
    },
  },
};
```

{% callout %}
You may be wondering, why the strange name for `$users`? It's because `$users` is a special table that Instant creates on your behalf. When you're ready to add [auth](/docs/auth) to your app, `$users` will automatically populate with signups.
{% /callout %}

### Indexing attributes

Speaking of fast queries, let's take a look at one: 

What if we wanted to query for a post that was published at a particular date? Here's how that query would look:

```typescript
const rocketChopsticks = '2024-10-13T00:00:00Z';
const query = { posts: { $: { where: { createdAt: rocketChopsticks } } } };
```

This would work, but the more posts we create, the slower the query would get. 

We'd have to scan every post, and compare the `createdAt` date.

To make this query faster, we can index `createdAt`:

```typescript
posts: i.entity({
  // ...
  createdAt: i.date().indexed(), // 🔥,
});
```

As it says on the tin, this command tells Instant to index the `createdAt` field, which makes this query get fast as heck.

## 3) Links

Links connect two entities together. When you define a link, you define it both in the 'forward', and the 'reverse' direction. For example:

```typescript
postAuthor: {
  forward: { on: "posts", has: "one", label: "author" },
  reverse: { on: "profiles", has: "many", label: "authoredPosts" },
}
```

This links `posts` and `profiles` together:

- `posts.owner` links to _one_ `profiles` entity
- `profiles.authoredPosts` links back to _many_ `posts` entities.

Since links are defined in both directions, you can query in both directions too:

```typescript
// This queries all posts with their author
{ posts: { author: {} } }; 

// This queries profiles, with all of their authoredPosts!
{ profiles: { authoredPosts: {} } }; 
```

Links can have one of four relationship types: `many-to-many`, `many-to-one`, `one-to-many`, and `one-to-one`

Our micro-blog example has the following relationship types:

- **One-to-one** between `profiles` and `$users`
- **One-to-many** between `posts` and `profiles`
- **One-to-many** between `comments` and `posts`
- **One-to-many** between `comments` and `profiles`
- **Many-to-many** between `posts` and `tags`

## Publishing your schema

Now that you have your schema, you can use the CLI to `push` it to your app: 

```bash
npx instant-cli@latest push schema
```

The CLI will look at your app in production, show you the new columns you'd create, and run the changes for you! 

## Use schema for typesafety

You can also use your schema inside `init`:

```typescript
import { init } from '@instantdb/react';

import schema from '../instant.schema.ts';

const db = init({ 
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!, 
  schema 
}); 
```

When you do this, all [queries](/docs/instaql) and [transactions](/docs/instaql) will come with typesafety out of the box. 

{% callout %}

If you haven't used the CLI to push your schema yet, no problem. Any time you write `transact`, we'll automatically create missing entities for you.

{% /callout %}

## Update or Delete Entities and Links

You can always modify or delete attributes after creating them. **You can't use the CLI to do this yet, but you can use the dashboard.**

Say we wanted to rename `posts.createdAt` to `posts.publishedAt`:

1. Go to your [Dashboard](https://instantdb.com/dash)
2. Click "Explorer"
3. Click "posts"
4. Click "Edit Schema" 
5. Click `createdAt` 

You'll see modal that you can use to rename the attribute, index it, or delete it: 


{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_3D2DA1E694B2F8E030AC1EC0B7C47C6AC1E40485744489E3189C95FCB5181D4A_1734057623734_img.png" /%}

## Secure your schema with permissions

In the earlier sections we mentioned that new `entities` and `attributes` can be created on the fly when you call `transact`. This can be useful for development, but you may not want this in production. 

To prevent changes to your schema on the fly, simply add these permissions to your app.

```typescript
// instant.perms.ts
import { type InstantRules } from "@instantdb/react";

const rules = {
  attrs: {
    allow: {
      $default: "false",
    },
  },
} satisfies InstantRules;

export default rules;
```

Once you push these permissions to production: 

```bash 
npx instant-cli@latest push perms
```

You'll still be able to make changes in the explorer or with the CLI, but client-side transactions that try to modify your schema will fail. This means your schema is safe from unwanted changes!

---

**If you've made it this far, congratulations! You should now be able to fully customize and lock down your data model. Huzzah!**
