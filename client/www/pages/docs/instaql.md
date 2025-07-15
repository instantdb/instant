---
title: Reading data
description: How to read data with Instant using InstaQL.
---

Instant uses a declarative syntax for querying. It's like GraphQL without the configuration. Here's how you can query data with **InstaQL.**

## Fetch namespace

One of the simplest queries you can write is to simply get all entities of a namespace.

```javascript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  // Queries! 🚀
  const query = { goals: {} };
  const { isLoading, error, data } = db.useQuery(query);
  // ...
}
```

Inspecting `data`, we'll see:

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!"
    },
    {
      "id": workId,
      "title": "Get promoted!"
    }
  ]
}
```

For comparison, the SQL equivalent of this would be something like:

```javascript
const data = { goals: doSQL('SELECT * FROM goals') };
```

## Fetch multiple namespaces

You can fetch multiple namespaces at once:

```javascript
const query = { goals: {}, todos: {} };
const { isLoading, error, data } = db.useQuery(query);
```

We will now see data for both namespaces.

```javascript
console.log(data)
{
  "goals": [...],
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch"
    },
    {
      "id": proteinId,
      "title": "Drink protein"
    },
    ...
  ]
}
```

The equivalent of this in SQL would be to write two separate queries.

```javascript
const data = {
  goals: doSQL('SELECT * from goals'),
  todos: doSQL('SELECT * from todos'),
};
```

## Fetch a specific entity

If you want to filter entities, you can use the `where` keyword. Here we fetch a specific goal

```javascript
const query = {
  goals: {
    $: {
      where: {
        id: healthId,
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!"
    }
  ]
}
```

The SQL equivalent would be:

```javascript
const data = { goals: doSQL("SELECT * FROM goals WHERE id = 'healthId'") };
```

## Fetch associations

We can fetch goals and their related todos.

```javascript
const query = {
  goals: {
    todos: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

`goals` would now include nested `todos`

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!",
      "todos": [...],
    },
    {
      "id": workId,
      "title": "Get promoted!",
      "todos": [...],
    }
  ]
}
```

### Comparing with SQL

The SQL equivalent for this would be something along the lines of:

```javascript
const query = `
  SELECT g.*, gt.todos
  FROM goals g
  JOIN (
      SELECT g.id, json_agg(t.*) as todos
      FROM goals g
      LEFT JOIN todos t on g.id = t.goal_id
      GROUP BY 1
  ) gt on g.id = gt.id
`;
const data = { goals: doSQL(query) };
```

Notice the complexity of this SQL query. Although fetching associations in SQL is straightforward via `JOIN`, marshalling the results in a nested structure via SQL is tricky. An alternative approach would be to write two straight-forward queries and then marshall the data on the client.

```javascript
const _goals = doSQL("SELECT * from goals")
const _todos = doSQL("SELECT * from todos")
const data = {goals: _goals.map(g => (
  return {...g, todos: _todos.filter(t => t.goal_id === g.id)}
))
```

Now compare these two approaches with `InstaQL`

```javascript
const query = {
  goals: {
    todos: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

Modern applications often need to render nested relations, `InstaQL` really starts to shine for these use cases.

## Fetch specific associations

### A) Fetch associations for filtered namespace

We can fetch a specific entity in a namespace as well as it's related associations.

```javascript
const query = {
  goals: {
    $: {
      where: {
        id: healthId,
      },
    },
    todos: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

Which returns

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!",
      "todos": [
        {
          "id": proteinId,
          "title": "Drink protein"
        },
        {
          "id": sleepId,
          "title": "Go to bed early"
        },
        {
          "id": workoutId,
          "title": "Go on a run"
        }
      ]
    }
  ]
}
```

### B) Filter namespace by associated values

We can filter namespaces **by their associations**

```javascript
const query = {
  goals: {
    $: {
      where: {
        'todos.title': 'Code a bunch',
      },
    },
    todos: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

Returns

```javascript
console.log(data)
{
  "goals": [
    {
      "id": workId,
      "title": "Get promoted!",
      "todos": [
        {
          "id": focusId,
          "title": "Code a bunch"
        },
        {
          "id": reviewPRsId,
          "title": "Review PRs"
        },
        {
          "id": standupId,
          "title": "Do standup"
        }
      ]
    }
  ]
}
```

### C) Filter associations

We can also filter associated data.

```javascript
const query = {
  goals: {
    todos: {
      $: {
        where: {
          'todos.title': 'Go on a run',
        },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

This will return goals and filtered todos

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!",
      "todos": [
        {
          "id": workoutId,
          "title": "Go on a run"
        }
      ]
    },
    {
      "id": workId,
      "title": "Get promoted!",
      "todos": []
    }
  ]
}
```

---

{% callout %}
Notice the difference between these three cases.

- A) Fetched all todos for goal with id `health`
- B) Filtered goals with a least one todo titled `Code a bunch`
- C) Fetched all goals and filtered associated todos by title `Go on a run`

{% /callout %}

---

## Inverse Associations

Associations are also available in the reverse order.

```javascript
const query = {
  todos: {
    goals: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch",
      "goals": [
        {
          "id": workId,
          "title": "Get promoted!"
        }
      ]
    },
    ...,
  ]
}
```

## Defer queries

You can also defer queries until a condition is met. This is useful when you
need to wait for some data to be available before you can run your query. Here's
an example of deferring a fetch for todos until a user is logged in.

```javascript
const { isLoading, user, error } = db.useAuth();

const {
  isLoading: isLoadingTodos,
  error,
  data,
} = db.useQuery(
  user
    ? {
        // The query will run once user is populated
        todos: {
          $: {
            where: {
              userId: user.id,
            },
          },
        },
      }
    : // Otherwise skip the query, which sets `isLoading` to true
      null,
);
```

**NOTE:** Passing `null` to `db.useQuery` will result in `isLoading` being true. In the example above, this means that `isLoadingTodos` will _always be true_ if the user is not logged in.

## Pagination

You can limit the number of items from a top level namespace by adding a `limit` to the option map:

```javascript
const query = {
  todos: {
    // limit is only supported for top-level namespaces right now
    // and not for nested namespaces.
    $: { limit: 10 },
  },
};

const { isLoading, error, data, pageInfo } = db.useQuery(query);
```

Instant supports both offset-based and cursor-based pagination for top-level
namespaces.

### Offset

To get the next page, you can use an offset:

```javascript
const query = {
  todos: {
    $: {
      limit: 10,
      // similar to `limit`, `offset` is only supported for top-level namespaces
      offset: 10,
    },
  },
};

const { isLoading, error, data, pageInfo } = db.useQuery(query);
```

In a React application, your offset-based pagination code might look something like this:

```jsx
const [pageNumber, setPageNumber] = React.useState(1);

const pageSize = 10;

const query = {
  todos: {
    $: {
      limit: pageSize,
      offset: pageSize * (pageNumber - 1),
    },
  },
};

const { isLoading, error, data } = db.useQuery(query);

// Load the next page by increasing the page number, which will
// increase the offset by the page size.
const loadNextPage = () => {
  setPageNumber(pageNumber + 1);
};

// Load the previous page by decreasing the page number, which will
// decrease the offset by the page size.
const loadPreviousPage = () => {
  setPageNumber(pageNumber - 1);
};
```

### Cursors

You can also get the next page with the `endCursor` returned in the `pageInfo` map from the previous result:

```javascript
const query = {
  todos: {
    $: {
      // These also are only supported for top-level namespaces
      first: 10,
      after: pageInfo?.todos?.endCursor,
    },
  },
};
```

To get the previous page, use the `startCursor` in the `before` field of the option map and ask for the `last` items:

```javascript
const query = {
  todos: {
    $: {
      last: 10,
      before: pageInfo?.todos?.startCursor,
    },
  },
};
```

In a React application, your cursor-based pagination code might look something like this:

```jsx
const pageSize = 10;

const [cursors, setCursors] = React.useState({ first: pageSize });

const query = {
  todos: {
    $: {
      ...cursors,
    },
  },
};

const { isLoading, error, data, pageInfo } = db.useQuery(query);

const loadNextPage = () => {
  const endCursor = pageInfo?.todos?.endCursor;
  if (endCursor) {
    setCursors({ after: endCursor, first: pageSize });
  }
};

const loadPreviousPage = () => {
  const startCursor = pageInfo?.todos?.startCursor;
  if (startCursor) {
    setCursors({
      before: startCursor,
      // Ask for the `last` 10 items so that we get the items just
      // before our startCursor
      last: pageSize,
    });
  }
};
```

### Ordering

The default ordering is by the time the objects were created, in ascending order. You can change the order with the `order` key in the option map for top-level namespaces:

```javascript
const query = {
  todos: {
    $: {
      limit: 10,
      // Similar to limit, order is limited to top-level namespaces right now
      order: {
        serverCreatedAt: 'desc',
      },
    },
  },
};
```

The `serverCreatedAt` field is a reserved key that orders by the time that the object was first persisted on the Instant backend. It can take the value 'asc' (the default) or 'desc'.

You can also order by any attribute that is indexed and has a checked type.

{% callout %}
Add indexes and checked types to your attributes from the [Explorer on the Instant dashboard](/dash?t=explorer) or from the [cli with Schema-as-code](/docs/schema).
{% /callout %}

```javascript
// Get the todos that are due next
const query = {
  todos: {
    $: {
      limit: 10,
      where: {
        dueDate: { $gt: Date.now() },
      },
      order: {
        dueDate: 'asc',
      },
    },
  },
};
```

## Advanced filtering

### Multiple `where` conditions

The `where` clause supports multiple keys which will filter entities that match all of the conditions.

```javascript
const query = {
  todos: {
    $: {
      where: {
        completed: true,
        'goals.title': 'Get promoted!',
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch",
      "completed": true
    }
  ]
}
```

### And

The `where` clause supports `and` queries which are useful when you want to filter entities that match multiple associated values.

In this example we want to find goals that have todos with the titles `Drink protein` and `Go on a run`

```javascript
const query = {
  goals: {
    $: {
      where: {
        and: [
          { 'todos.title': 'Drink protein' },
          { 'todos.title': 'Go on a run' },
        ],
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!"
    }
  ]
}
```

### OR

The `where` clause supports `or` queries that will filter entities that match any of the clauses in the provided list:

```javascript
const query = {
  todos: {
    $: {
      where: {
        or: [{ title: 'Code a bunch' }, { title: 'Review PRs' }],
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data);
{
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch"
    },
    {
      "id": reviewPRsId,
      "title": "Review PRs"
    },
  ]
}
```

### $in

The `where` clause supports `$in` queries that will filter entities that match any of the items in the provided list.
You can think of this as a shorthand for `or` on a single key.

```javascript
const query = {
  todos: {
    $: {
      where: {
        title: { $in: ['Code a bunch', 'Review PRs'] },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch"
    },
    {
      "id": reviewPRsId,
      "title": "Review PRs"
    }
  ]
}
```

### Comparison operators

The `where` clause supports comparison operators on fields that are indexed and have checked types.

{% callout %}
Add indexes and checked types to your attributes from the [Explorer on the Instant dashboard](/dash?t=explorer) or from the [cli with Schema-as-code](/docs/modeling-data).
{% /callout %}

| Operator |       Description        | JS equivalent |
| :------: | :----------------------: | :-----------: |
|  `$gt`   |       greater than       |      `>`      |
|  `$lt`   |        less than         |      `<`      |
|  `$gte`  | greater than or equal to |     `>=`      |
|  `$lte`  |  less than or equal to   |     `<=`      |

```javascript
const query = {
  todos: {
    $: {
      where: {
        timeEstimateHours: { $gt: 24 },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data);
{
  "todos": [
    {
      "id": buildShipId,
      "title": "Build a starship prototype",
      "timeEstimateHours": 5000
    }
  ]
}
```

Dates can be stored as timestamps (milliseconds since the epoch, e.g. `Date.now()`) or as ISO 8601 strings (e.g. `JSON.stringify(new Date())`) and can be queried in the same formats:

```javascript
const now = '2024-11-26T15:25:00.054Z';
const query = {
  todos: {
    $: { where: { dueDate: { $lte: now } } },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data);
{
  "todos": [
    {
      "id": slsFlightId,
      "title": "Space Launch System maiden flight",
      "dueDate": "2017-01-01T00:00:00Z"
    }
  ]
}
```

If you try to use comparison operators on data that isn't indexed and type-checked, you'll get an error:

```javascript
const query = {
  todos: {
    $: { where: { priority: { $gt: 2 } } },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(error);
{
  "message": "Validation failed for query",
  "hint": {
    "data-type": "query",
    "errors": [
      {
        "expected?": "indexed?",
        "in": ["priority", "$", "where", "priority"],
        "message": "The `todos.priority` attribute must be indexed to use comparison operators."
      }
    ],
    "input": {
      "todos": {
        "$": {
          "where": {
            "priority": {
              "$gt": 2
            }
          }
        }
      }
    }
  }
}
```

### $not

The `where` clause supports `$not` queries that will return entities that don't
match the provided value for the field, including entities where the field is null or undefined.

```javascript
const query = {
  todos: {
    $: {
      where: {
        location: { $not: 'work' },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": cookId,
      "title": "Cook dinner",
      "location": "home"
    },
    {
      "id": readId,
      "title": "Read",
      "location": null
    },
        {
      "id": napId,
      "title": "Take a nap"
    }
  ]
}
```

### $isNull

The `where` clause supports `$isNull` queries that will filters entities by whether the field value is either null or undefined.

Set `$isNull` to `true` to return entities where where the field is null or undefined.

Set `$isNull` to `false` to return entities where the field is not null and not undefined.

```javascript
const query = {
  todos: {
    $: {
      where: {
        location: { $isNull: false },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": cookId,
      "title": "Cook dinner",
      "location": "home"
    }
  ]
}
```

```javascript
const query = {
  todos: {
    $: {
      where: {
        location: { $isNull: true },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "todos": [
    {
      "id": readId,
      "title": "Read",
      "location": null
    },
    {
      "id": napId,
      "title": "Take a nap"
    }
  ]
}
```

### $like

The `where` clause supports `$like` on fields that are indexed with a checked `string` type.

`$like` queries will return entities that match a **case sensitive** substring of the provided value for the field.

For **case insensitive** matching use `$ilike` in place of `$like`.

Here's how you can do queries like `startsWith`, `endsWith` and `includes`.

|          Example          |      Description      | JS equivalent |
| :-----------------------: | :-------------------: | :-----------: |
|    `{ $like: "Get%" }`    |   Starts with 'Get'   | `startsWith`  |
| `{ $like: "%promoted!" }` | Ends with 'promoted!' |  `endsWith`   |
|   `{ $like: "%fit%" }`    |    Contains 'fit'     |  `includes`   |

Here's how you can use `$like` to find all goals that end with the word
"promoted!"

```javascript
// Find all goals that end with the word "promoted!"
const query = {
  goals: {
    $: {
      where: {
        title: { $like: '%promoted!' },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": workId,
      "title": "Get promoted!",
    }
  ]
}
```

You can use `$like` in nested queries as well

```javascript
// Find goals that have todos with the word "standup" in their title
const query = {
  goals: {
    $: {
      where: {
        'todos.title': { $like: '%standup%' },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

Returns

```javascript
console.log(data)
{
  "goals": [
    {
      "id": standupId,
      "title": "Perform standup!",
    }
  ]
}
```

Case-insensitive matching with `$ilike`:

```javascript
const query = {
  goals: {
    $: {
      where: {
        'todos.title': { $ilike: '%stand%' },
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": standupId,
      "title": "Perform standup!",
    },
    {
      "id": standId,
      "title": "Stand up a food truck.",
    }
  ]
}
```

## Select fields

An InstaQL query will fetch all fields for each object.

If you prefer to select the specific fields that you want your query to return, use the `fields` param:

```javascript
const query = {
  goals: {
    $: {
      fields: ['status'],
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": standupId, // id will always be returned even if not specified
      "status": "in-progress"
    },
    {
      "id": standId,
      "status": "completed"
    }
  ]
}
```

`fields` also works with nested relations:

```javascript
const query = {
  goals: {
    $: {
      fields: ['title'],
    },
    todos: {
      $: {
        fields: ['id'],
      },
    },
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

```javascript
console.log(data)
{
  "goals": [
    {
      "id": standupId,
      "title": "Perform standup!",
      "todos": [{"id": writeJokesId}, {"id": goToOpenMicId}]
    },
    {
      "id": standId,
      "title": "Stand up a food truck.",
      "todos": [{"id": learnToCookId}, {"id": buyATruckId}]
    }
  ]
}
```

Using `fields` can be useful for performance optimization. It reduces the
amount of data that needs to be transferred from the server and minimizes the
number of re-renders in your React application if there are no changes to your
selected fields.

{% callout type="warning" %}

Using `fields` doesn't restrict a client from doing a full query. If you have sensitive data on your entities that you
don't want to expose you'll want to use [permissions](/docs/permissions) and potentially [split your
namespace](docs/patterns#attribute-level-permissions) to restrict access.

{% /callout %}

## Typesafety

By default, `db.useQuery` is permissive. You don't have to tell us your schema upfront, and you can write any kind of query:

```typescript
const query = {
  goals: {
    todos: {},
  },
};
const { isLoading, error, data } = db.useQuery(query);
```

As your app grows, you may want to start enforcing types. When you're ready you can write a [schema](/docs/modeling-data). If your schema includes `goals` and `todos` for example:

```typescript
// instant.schema.ts

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    goals: i.entity({
      title: i.string(),
    }),
    todos: i.entity({
      title: i.string(),
      text: i.string(),
      done: i.boolean(),
      createdAt: i.date(),
      dueDate: i.date(),
    }),
  },
  links: {
    goalsTodos: {
      forward: { on: 'goals', has: 'many', label: 'todos' },
      reverse: { on: 'todos', has: 'many', label: 'goals' },
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

Instant will start giving you intellisense for your queries. For example, if you're querying for goals, you'll see that only `todos` can be associated:

{% screenshot src="/img/docs/instaql-todos-goals-autocomplete.png" /%}

And if you hover over `data`, you'll see the actual typed output of your query:

{% screenshot src="/img/docs/instaql-data-intellisense.png" /%}

### Utility Types

Instant also comes with some utility types to help you use your schema in TypeScript.

For example, you could define your `query` upfront:

```typescript
import { InstaQLParams } from '@instantdb/react';
import { AppSchema } from '../instant.schema.ts';

// `query` typechecks against our schema!
const query = {
  goals: { todos: {} },
} satisfies InstaQLParams<AppSchema>;
```

Or you can define your result type:

```typescript
import { InstaQLResult } from '@instantdb/react';
import { AppSchema } from '../instant.schema.ts';

type GoalsTodosResult = InstaQLResult<AppSchema, { goals: { todos: {} } }>;
```

Or you can extract a particular entity:

```typescript
import { InstaQLEntity } from '@instantdb/react';
import { AppSchema } from '../instant.schema.ts';

type Todo = InstaQLEntity<AppSchema, 'todos'>;
```

You can specify links relative to your entity:

```typescript
type TodoWithGoals = InstaQLEntity<AppSchema, 'todos', { goals: {} }>;
```

To learn more about writing schemas, check out the [Modeling Data](/docs/modeling-data) section.

## Query once

Sometimes, you don't want a subscription, and just want to fetch data once. For example, you might want to fetch data before rendering a page or check whether a user name is available.

In these cases, you can use `queryOnce` instead of `useQuery`. `queryOnce` returns a promise that resolves with the data once the query is complete.

Unlike `useQuery`, `queryOnce` will throw an error if the user is offline. This is because `queryOnce` is intended for use cases where you need the most up-to-date data.

```javascript
const query = { todos: {} };
const { data } = await db.queryOnce(query);
// returns the same data as useQuery, but without the isLoading and error fields
```

You can also do pagination with `queryOnce`:

```javascript
const query = {
  todos: {
    $: {
      limit: 10,
      offset: 10,
    },
  },
};

const { data, pageInfo } = await db.queryOnce(query);
// pageInfo behaves the same as with useQuery
```
