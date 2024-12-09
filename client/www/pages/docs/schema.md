---
title: Schema-as-code
---

**The schema definition file: `instant.schema.ts`**

This file lives in the root of your project and will be consumed by [the Instant CLI](/docs/cli). You can apply your schema to the production database with `npx instant-cli push schema`.

The default export of `instant.schema.ts` should always be the result of a call to `i.schema`.

```typescript
// instant.schema.ts

import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: entitiesMap, // a map of `i.entity` definitions, see "Defining entities" below
  links: linksMap, // a description of links between your app's entities, see "Defining links" below
  rooms: roomsMap // If you use presence or cursors, you can define your schema for them here
);

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export { type AppSchema };
export default schema;
```

## Defining entities

The `entities` paramemter in `i.schema` is a dictionary of entities, where the key represents the entities name, and the value is a call to `i.entity` with a dictionary of attributes.

```typescript
{
  profile: i.entity({
    name: i.string(),
    email: i.string().unique().indexed(),
    age: i.number().optional(),
  }),
  // more definitions...
}
```

## Defining an attribute

Entity definitions accept a map of attribute definitions, where the key represents the attribute name and the value contains configuration for the attribute.

First we specify the expected type of the attribute: `i.string()`, `i.number()`, `i.boolean()`, `i.date()`, `i.json()`, or `i.any()`.

{% callout %}

`i.date()` accepts dates as either a numeric timestamp (in milliseconds) or an ISO 8601 string. `JSON.stringify(new Date())` will return an ISO 8601 string.

{% /callout %}

We can then chain modifiers: `.optional()`, `.unique()` and `.indexed()`.

When adding a type to an existing attribute, `push schema` will kick off a job to check the existing data for the attribute before setting the type on the attribute. If you prefer not to enforce the type, you can run `push schema` with the `--skip-check-types` flag.

Here are some examples:

```typescript
// strings
i.string();

// numbers
i.number();

// booleans
i.boolean();

// complex JSON values
i.json<ValueShape>();

// any type
i.any();

// optional
i.string().optional();

// indexed values
i.string().indexed();

// unique
i.string().unique();

// chaining
i.string().unique().indexed();
```

## Defining links

Link definitions are used to express relationships in your app's data model.

Links are bidirectional, and you can specify a name and cardinality for both the forward and reverse direction.

```typescript
{
  authorPosts: {
    forward: {
      on: 'authors',  // corresponds to an entity name
      has: 'many', // the cardinality of the authors -> posts link, i.e. "authors have many posts"
      label: 'posts', // the name of the field when performing queries with InstaQL
    },
    reverse: {
      on: 'posts', // corresponds to an entity name
      has: 'one', // i.e. the cardinality of the posts -> authors link, "posts have one author"
      label: 'author', // the name of the field when performing queries with InstaQL
    },
  },
  // more links...
}
```

## Defining rooms

The `rooms` key let you define a schema for [presence, cursors, and other ephemeral features](./presence-and-topics.md). Here's how this looks:

```typescript
{
  // `chat` is the `roomType`
  chat: {
    // You can define presence state here
    presence: i.entity({
      nickname: i.string(),
    }),
    topics: {
      // You can define payloads for different topics here
      sendEmoji: i.entity({
        emoji: i.string(),
      })
    }
  }
}
```

## An example schema file

Below we demonstrate a data model for a blog. First we define our core entities: authors, posts and tags.

Then we define links. Note how each direction specifies its own label (`posts.author` instead of `posts.authors`) and cardinality (`has: 'one'` and `has: 'many'`).

Make sure to set the graph object as your file's default export to that it can be picked up by the CLI.

```typescript
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    posts: i.entity({
      title: i.string(),
      content: i.string(),
    }),
    tags: i.entity({
      label: i.string(),
    }),
  },
  links: {
    postsAuthor: {
      forward: {
        on: 'posts',
        has: 'one',
        label: 'author',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'authoredPosts',
      },
    },
    postsTags: {
      forward: {
        on: 'posts',
        has: 'many',
        label: 'tags',
      },
      reverse: {
        on: 'tags',
        has: 'many',
        label: 'posts',
      },
    },
  },
  rooms: {
    chat: {
      presence: i.entity({
        nickname: i.string(),
      }),
      topics: {
        sendEmoji: i.entity({
          emoji: i.string(),
        }),
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
