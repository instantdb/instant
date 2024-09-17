---
title: Schema-as-code
---

**The schema definition file: `instant.schema.ts`**

This file lives in the root of your project and will be consumed by [the Instant CLI](/docs/cli). You can apply your schema to the production database with `npx instant-cli push-schema`.

The default export of `instant.schema.ts` should always be the result of a call to `i.graph`.

```typescript
// instant.schema.ts

import { i } from '@instantdb/core';

export default i.graph(
  entitiesMap, // a map of `i.entity` definitions, see "Defining entities" below
  linksMap // a description of links between your app's entities, see "Defining links" below
);

export default graph;
```

## Defining entities

The first parameter to `i.graph` is a dictionary of entities, where the key represents the entities name, and the value is a call to `i.entity` with a dictionary of attributes.

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

First we specify the expected type of the attribute: `i.string()`, `i.number()`, `i.boolean()`, `i.json()` and `i.any()`.

We can then chain modifiers: `.optional()`, `.unique()` and `.indexed()`.

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

Link definitions are used to express relationships in your app's graph model.

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

## An example schema file

Below we demonstrate a data model for a blog. First we define our core entities: authors, posts and tags.

Then we define links. Note how each direction specifies its own label (`posts.author` instead of `posts.authors`) and cardinality (`has: 'one'` and `has: 'many'`).

Make sure to set the graph object as your file's default export to that it can be picked up by the CLI.

```typescript
import { i } from '@instantdb/core';

const graph = i.graph(
  {
    authors: i.entity({
      userId: i.string(),
      name: i.string(),
    }),
    posts: i.entity({
      name: i.string(),
      content: i.string(),
    }),
    tags: i.entity({
      label: i.string(),
    }),
  },
  {
    authorPosts: {
      forward: {
        on: 'authors',
        has: 'many',
        label: 'posts',
      },
      reverse: {
        on: 'posts',
        has: 'one',
        label: 'author',
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
  }
);

export default graph;
```
