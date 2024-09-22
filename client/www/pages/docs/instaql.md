---
title: Reading data
---

Instant uses a declarative syntax for querying. It's like GraphQL without the configuration. Here's how you can query data with **InstaQL.**

## Fetch namespace

One of the simplest queries you can write is to simply get all entities of a namespace.

```javascript
const query = { goals: {} }
const { isLoading, error, data } = db.useQuery(query)
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
const data = { goals: doSQL('SELECT * FROM goals') }
```

## Fetch multiple namespaces

You can fetch multiple namespaces at once:

```javascript
const query = { goals: {}, todos: {} }
const { isLoading, error, data } = db.useQuery(query)
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
}
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
}
const { isLoading, error, data } = db.useQuery(query)
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
const data = { goals: doSQL("SELECT * FROM goals WHERE id = 'healthId'") }
```

## Fetch associations

We can fetch goals and their related todos.

```javascript
const query = {
  goals: {
    todos: {},
  },
}
const { isLoading, error, data } = db.useQuery(query)
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
const query = "
SELECT g.*, gt.todos
FROM goals g
JOIN (
    SELECT g.id, json_agg(t.*) as todos
    FROM goals g
    LEFT JOIN todos t on g.id = t.goal_id
    GROUP BY 1
) gt on g.id = gt.id
"
const data = {goals: doSQL(query)}
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
}
const { isLoading, error, data } = db.useQuery(query)
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
}
const { isLoading, error, data } = db.useQuery(query)
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
}
const { isLoading, error, data } = db.useQuery(query)
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
}
const { isLoading, error, data } = db.useQuery(query)
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
}
const { isLoading, error, data } = db.useQuery(query)
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

## Pagination

You can limit the number of items returned by adding a `limit` to the option map:

```javascript
const query = {
  todos: {
    $: { limit: 10 },
  },
};

const { isLoading, error, data, pageInfo } = db.useQuery(query);
```

Instant supports both offset-based and cursor-based pagination.

### Offset

To get the next page, you can use an offset:

```javascript
const query = {
  todos: {
    $: {
      limit: 10,
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

The default ordering is by the time the objects were created, in ascending order. You can change the order with the `order` key in the option map:

```javascript
const query = {
  todos: {
    $: {
      limit: 10,
      order: {
        serverCreatedAt: 'desc',
      },
    },
  },
};
```

The `serverCreatedAt` field is a reserved key that orders by the time that the object was first persisted on the Instant backend. It can take the value 'asc' (the default) or 'desc'.

## Advanced filtering

### And

The `where` clause supports multiple keys which will filter entities that match all of the conditions.

You can also provide a list of queries under the `and` key.

**Multiple keys in a single where**:

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

**`and` key:**

The `and` key is useful when you want an entity to match multiple conditions.
In this case we want to find goals that have both `Drink protein` and `Go on a
run` todos.:

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
        or: [
          { title: 'Code a bunch' },
          { title: 'Review PRs' }
        ],
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

### In

The `where` clause supports `in` queries that will filter entities that match any of the items in the provided list.
You can think of this as a shorthand for `or` on a single key.

```javascript
const query = {
  todos: {
    $: {
      where: {
        title: { in: ['Code a bunch', 'Review PRs'] },
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
    },
  ]
}
```
