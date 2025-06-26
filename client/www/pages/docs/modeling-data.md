---
title: Modeling data
description: How to model data with Instant's schema.
---

In this section we’ll learn how to model data using Instant's schema. By the end of this document you’ll know how to:

- Create namespaces and attributes
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

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
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
      forward: { on: 'posts', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'authoredPosts' },
    },
    commentPost: {
      forward: { on: 'comments', has: 'one', label: 'post' },
      reverse: { on: 'posts', has: 'many', label: 'comments' },
    },
    commentAuthor: {
      forward: { on: 'comments', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'authoredComments' },
    },
    postsTags: {
      forward: { on: 'posts', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'posts' },
    },
    profileUser: {
      forward: { on: 'profiles', has: 'one', label: '$user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
  },
});

// This helps Typescript display better intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

Let's unpack what we just wrote. There are three core building blocks to model data with Instant: **Namespaces**, **Attributes**, and **Links**.

## 1) Namespaces

Namespaces are equivelant to "tables" in relational databases or "collections" in NoSQL. In our case, these are: `$users`, `profiles`, `posts`, `comments`, and `tags`.

They're all defined in the `entities` section:

```typescript
// instant.schema.ts

const _schema = i.schema({
  entities: {
    posts: i.entity({
      // ...
    }),
  },
});
```

## 2) Attributes

Attributes are properties associated with namespaces. These are equivelant to a "column" in relational databases or a "field" in NoSQL. For the `posts` entity, we have the `title`, `body`, and `createdAt` attributes:

```typescript
// instant.schema.ts

const _schema = i.schema({
  entities: {
    // ...
    posts: i.entity({
      title: i.string(),
      body: i.string(),
      createdAt: i.date(),
    }),
  },
});
```

### Typing attributes

Attributes can be typed as `i.string()`, `i.number()`, `i.boolean()`, `i.date()`, `i.json()`, or `i.any()`.

{% callout %}

`i.date()` accepts dates as either a numeric timestamp (in milliseconds) or an ISO 8601 string. `JSON.stringify(new Date())` will return an ISO 8601 string.

{% /callout %}

When you type `posts.title` as a `string`:

```typescript
// instant.schema.ts

const _schema = i.schema({
  entities: {
    // ...
    posts: i.entity({
      title: i.string(),
      // ...
    }),
  },
});
```

Instant will _make sure_ that all `title` attributes are strings, and you'll get the proper typescript hints to boot!

### Required constraints

All attributes you define are considered _required_ by default. This constraint is enforced on the backend: Instant guarantees that every entity of that type will have a value and reports errors if you attempt to add an entity without a required attribute.

```typescript
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(), // <-- required
      published: i.date(), // <-- required
    }),
  },
});

db.transact(
  db.tx.posts[id()].update({
    title: 'abc', // <-- no published -- will throw
  }),
);
```

You can mark attribute as optional by calling `.optional()`:

```typescript
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(), // <-- required
      published: i.date().optional(), // <-- optional
    }),
  },
});

db.transact(
  db.tx.posts[id()].update({
    title: 'abc', // <-- no published -- still okay
  }),
);
```

This will also reflect in types: query results containing `posts` will show `title: string` (non-nullable) and `published: string | number | null` (nullable).

You can set required on forward links, too:

```typescript
postAuthor: {
  forward: { on: 'posts', has: 'one', label: 'author', required: true },
  reverse: { on: 'profiles', has: 'many', label: 'authoredPosts' },
},
```

Finally, for legacy attributes that are treated as required on your front-end but you are not ready to enable back-end required checks yet, you can use `.clientRequired()`. That will produce TypeScript type without `null` but will not add back-end required check:

```typescript
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string().clientRequired(),
      published: i.date().optional(),
    }),
  },
});
```

### Unique constraints

Sometimes you'll want to introduce a unique constraint. For example, say we wanted to add friendly URL's to posts. We could introduce a `slug` attribute:

```typescript
// instant.schema.ts

const _schema = i.schema({
  entities: {
    // ...
    posts: i.entity({
      slug: i.string().unique(),
      // ...
    }),
  },
});
```

Since we're going to use post slugs in URLs, we'll want to make sure that no two posts can have the same slug. If we mark `slug` as `unique`, _Instant will guarantee this constraint for us_.

Plus unique attributes come with their own special index. This means that if you use a unique attribute inside a query, we can fetch the object quickly:

```typescript
const query = {
  posts: {
    $: {
      where: {
        // Since `slug` is unique, this query is 🚀 fast
        slug: 'completing_sicp',
      },
    },
  },
};
```

### Indexing attributes

Speaking of fast queries, let's take a look at one:

What if we wanted to query for a post that was published at a particular date? Here's a query to get posts that were published during SpaceX's chopstick launch:

```typescript
const rocketChopsticks = '2024-10-13T00:00:00Z';
const query = { posts: { $: { where: { createdAt: rocketChopsticks } } } };
```

This would work, but the more posts we create, the slower the query would get. We'd have to scan every post and compare the `createdAt` date.

To make this query faster, we can index `createdAt`:

```typescript
// instant.schema.ts

const _schema = i.schema({
  entities: {
    // ...
    posts: i.entity({
      createdAt: i.date().indexed(), // 🔥,
      // ...
    }),
  },
});
```

As it says on the tin, this command tells Instant to index the `createdAt` field, which lets us quickly look up entities by this attribute.

## 3) Links

Links connect two namespaces together. When you define a link, you define it both in the 'forward', and the 'reverse' direction. For example:

```typescript
postAuthor: {
  forward: { on: "posts", has: "one", label: "author" },
  reverse: { on: "profiles", has: "many", label: "authoredPosts" },
}
```

This links `posts` and `profiles` together:

- `posts.author` links to _one_ `profiles` entity
- `profiles.authoredPosts` links back to _many_ `posts` entities.

Since links are defined in both directions, you can query in both directions too:

```typescript
// This queries all posts with their author
const query1 = {
  posts: {
    author: {},
  },
};

// This queries profiles, with all of their authoredPosts!
const query2 = {
  profiles: {
    authoredPosts: {},
  },
};
```

Links can have one of four relationship types: `many-to-many`, `many-to-one`, `one-to-many`, and `one-to-one`

Our micro-blog example has the following relationship types:

- **One-to-one** between `profiles` and `$users`
- **One-to-many** between `posts` and `profiles`
- **One-to-many** between `comments` and `posts`
- **One-to-many** between `comments` and `profiles`
- **Many-to-many** between `posts` and `tags`

### Cascade Delete

Links defined with `has: "one"` can set `onDelete: "cascade"`. In this case, when the profile entity is deleted, all post entities will be deleted too:

```typescript
postAuthor: {
  forward: { on: "posts", has: "one", label: "author", onDelete: "cascade" },
  reverse: { on: "profiles", has: "many", label: "authoredPosts" },
}

// this will delete profile and all linked posts
db.tx.profiles[user_id].delete();
```

Without `onDelete: "cascade"`, deleting a profile would simply delete the links but not delete the underlying posts.

If you prefer to model links in other direction, you can do it, too:

```
postAuthor: {
  forward: { on: "profiles", has: "many", label: "authoredPosts" },
  reverse: { on: "posts", has: "one", label: "author", onDelete: "cascade" },
}
```

## Publishing your schema

Now that you have your schema, you can use the CLI to `push` it to your app:

```shell {% showCopy=true %}
npx instant-cli@latest push schema
```

The CLI will look at your app in production, show you the new columns you'd create, and run the changes for you!

{% ansi %}

```
Checking for an Instant SDK...
Found [32m@instantdb/react[39m in your package.json.
Found [32mNEXT_PUBLIC_INSTANT_APP_ID[39m: *****
Planning schema...
The following changes will be applied to your production schema:
[35mADD ENTITY[39m profiles.id
[35mADD ENTITY[39m posts.id
[35mADD ENTITY[39m comments.id
[35mADD ENTITY[39m tags.id
[32mADD ATTR[39m profiles.nickname :: unique=false, indexed=false
[32mADD ATTR[39m profiles.createdAt :: unique=false, indexed=false
[32mADD ATTR[39m posts.title :: unique=false, indexed=false
[32mADD ATTR[39m posts.slug :: unique=true, indexed=false
[32mADD ATTR[39m posts.body :: unique=false, indexed=false
[32mADD ATTR[39m posts.createdAt :: unique=false, indexed=true
[32mADD ATTR[39m comments.body :: unique=false, indexed=false
[32mADD ATTR[39m comments.createdAt :: unique=false, indexed=false
[32mADD ATTR[39m tags.title :: unique=false, indexed=false
[32mADD LINK[39m posts.author <=> profiles.authoredPosts
[32mADD LINK[39m comments.post <=> posts.comments
[32mADD LINK[39m comments.author <=> profiles.authoredComments
[32mADD LINK[39m posts.tags <=> tags.posts
[32mADD LINK[39m profiles.$user <=> $users.profile
[2K[34m?[39m [1mOK to proceed?[22m [36myes
[32mSchema updated![39m
```

{% /ansi %}

## Use schema for typesafety

You can also use your schema inside `init`:

```typescript
import { init } from '@instantdb/react';

import schema from '../instant.schema.ts';

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
});
```

When you do this, all [queries](/docs/instaql) and [transactions](/docs/instaml) will come with typesafety out of the box.

{% callout %}

If you haven't used the CLI to push your schema yet, no problem. Any time you write `transact`, we'll automatically create missing entities for you.

{% /callout %}

## Update or Delete attributes

You can always modify or delete attributes after creating them. **You can't use the CLI to do this yet, but you can use the dashboard.**

Say we wanted to rename `posts.createdAt` to `posts.publishedAt`:

1. Go to your [Dashboard](https://instantdb.com/dash)
2. Click "Explorer"
3. Click "posts"
4. Click "Edit Schema"
5. Click `createdAt`

You'll see a modal that you can use to rename the attribute, index it, or delete it:

{% screenshot src="/img/docs/modeling-data-rename-attr.png" /%}

## Secure your schema with permissions

In the earlier sections we mentioned that new `entities` and `attributes` can be created on the fly when you call `transact`. This can be useful for development, but you may not want this in production.

To prevent changes to your schema on the fly, simply add these permissions to your app.

```typescript
// instant.perms.ts
import type { InstantRules } from '@instantdb/react';

const rules = {
  attrs: {
    allow: {
      $default: 'false',
    },
  },
} satisfies InstantRules;

export default rules;
```

Once you push these permissions to production:

```bash
npx instant-cli@latest push perms
```

{% ansi %}

```
Checking for an Instant SDK...
Found [32m@instantdb/react[39m in your package.json.
Found [32mNEXT_PUBLIC_INSTANT_APP_ID[39m: *****
Planning perms...
The following changes will be applied to your perms:
[31m-null[39m
[32m+{[39m
[32m+  attrs: {[39m
[32m+    allow: {[39m
[32m+      $default: "false"[39m
[32m+    }[39m
[32m+  }[39m
[32m+}[39m
[1mOK to proceed?[22m [36myes[39m[21
[32mPermissions updated![39m
```

{% /ansi %}

You'll still be able to make changes in the explorer or with the CLI, but client-side transactions that try to modify your schema will fail. This means your schema is safe from unwanted changes!

---

**If you've made it this far, congratulations! You should now be able to fully customize and lock down your data model. Huzzah!**
