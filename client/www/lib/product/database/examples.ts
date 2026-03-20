export const typicalArch = `                   Typical architecture

╔════════╗  /GET todos  ╔════════╗  SELECT * FROM  ╔════════╗
║        ║─────────────▶║        ║───── todos ────▶║        ║
║ Client ║              ║ Server ║                 ║   DB   ║
║        ║◀─────────────║        ║◀────────────────║        ║
╚════════╝  json resp.  ╚════════╝   result rows   ╚════════╝`;

export const instantArch = `             With Instant

╔════════╗  { todos: {} }  ╔═════════╗
║        ║────────────────▶║         ║
║ Client ║                 ║ Instant ║
║        ║◀────────────────║         ║
╚════════╝  realtime data  ╚═════════╝`;

export const queryExamples = [
  {
    label: 'Nested query',
    query: `// Fetch all goals with their todos
db.useQuery({
  goals: {
    todos: {},
  },
});`,
    result: `{
  "goals": [
    {
      "id": healthId,
      "title": "Get fit!",
      "todos": [...]
    },
    {
      "id": workId,
      "title": "Get promoted!",
      "todos": [...]
    }
  ]
}`,
    sql: `SELECT g.*,
       COALESCE(
         (SELECT json_agg(t.*) FROM todos t WHERE t.goal_id = g.id),
         '[]'
       ) AS todos
FROM goals g;`,
  },
  {
    label: 'Multiple where',
    query: `// Fetch completed todos for a specific goal
db.useQuery({
  todos: {
    $: {
      where: {
        completed: true,
        'goals.title': 'Get promoted!',
      },
    },
  },
});`,
    result: `{
  "todos": [
    {
      "id": focusId,
      "title": "Code a bunch",
      "completed": true
    }
  ]
}`,
    sql: `SELECT t.*
FROM todos t
JOIN goals g ON g.id = t.goal_id
WHERE t.completed = true
  AND g.title = 'Get promoted!';`,
  },
  {
    label: 'Fetch recent',
    query: `// Fetch recent chats with messages, newest first
db.useQuery({
  chats: {
    $: {
      where: {
        createdAt: { $gte: lastWeek },
      },
      order: { createdAt: 'desc' },
    },
    messages: {},
  },
});`,
    result: `{
  "chats": [
    {
      "id": chat2Id,
      "title": "Ship the feature",
      "createdAt": 1740400000000,
      "messages": [...]
    },
    {
      "id": chat1Id,
      "title": "Weekly sync",
      "createdAt": 1740300000000,
      "messages": [...]
    }
  ]
}`,
    sql: `SELECT c.*,
       COALESCE(
         (SELECT json_agg(m.*) FROM messages m WHERE m.chat_id = c.id),
         '[]'
       ) AS messages
FROM chats c
WHERE c.created_at >= :lastWeek
ORDER BY c.created_at DESC;`,
  },
  {
    label: 'Pagination',
    query: `// Search messages containing "deploy", page 3
db.useQuery({
  messages: {
    $: {
      where: {
        body: { $like: '%deploy%' },
      },
      limit: 10,
      offset: 20,
    },
  },
});`,
    result: `{
  "messages": [
    {
      "id": msg21Id,
      "body": "Ready to deploy staging"
    },
    {
      "id": msg22Id,
      "body": "Deploy looks good to me"
    },
    ...
  ]
}`,
    sql: `SELECT *
FROM messages
WHERE body LIKE '%deploy%'
LIMIT 10
OFFSET 20;`,
  },
  {
    label: 'Deep nesting',
    query: `// Fetch an org with its teams, members, and roles
db.useQuery({
  orgs: {
    $: { where: { slug: 'acme' } },
    teams: {
      members: {
        roles: {},
      },
    },
  },
});`,
    result: `{
  "orgs": [
    {
      "slug": "acme",
      "name": "Acme Corp",
      "teams": [
        {
          "name": "Engineering",
          "members": [
            {
              "name": "Alice",
              "roles": [{ "name": "admin" }]
            },
            ...
          ]
        },
        ...
      ]
    }
  ]
}`,
    sql: `SELECT o.*,
       COALESCE(
         (SELECT json_agg(json_build_object(
           'name', t.name,
           'members', COALESCE(
             (SELECT json_agg(json_build_object(
               'name', m.name,
               'roles', COALESCE(
                 (SELECT json_agg(r.*) FROM roles r WHERE r.member_id = m.id),
                 '[]'
               )
             )) FROM members m WHERE m.team_id = t.id),
             '[]'
           )
         )) FROM teams t WHERE t.org_id = o.id),
         '[]'
       ) AS teams
FROM orgs o
WHERE o.slug = 'acme';`,
  },
  {
    label: 'Negation',
    query: `// Fetch all tickets that are not closed
db.useQuery({
  tickets: {
    $: {
      where: {
        status: { $not: 'closed' },
      },
    },
    assignee: {},
  },
});`,
    result: `{
  "tickets": [
    {
      "id": t1Id,
      "title": "Fix login bug",
      "status": "open",
      "assignee": { "name": "Alice" }
    },
    {
      "id": t2Id,
      "title": "Add dark mode",
      "status": "in_progress",
      "assignee": { "name": "Bob" }
    },
    ...
  ]
}`,
    sql: `SELECT t.*,
       COALESCE(
         (SELECT json_agg(a.*) FROM users a WHERE a.id = t.assignee_id),
         '[]'
       ) AS assignee
FROM tickets t
WHERE t.status != 'closed';`,
  },
  {
    label: 'Range query',
    query: `// Fetch products between $10 and $100
db.useQuery({
  products: {
    $: {
      where: {
        price: { and: [{ $gte: 10 }, { $lte: 100 }] },
      },
      order: { price: 'asc' },
    },
  },
});`,
    result: `{
  "products": [
    {
      "id": p1Id,
      "name": "Notebook",
      "price": 12.99
    },
    {
      "id": p2Id,
      "name": "Backpack",
      "price": 49.99
    },
    ...
  ]
}`,
    sql: `SELECT *
FROM products
WHERE price >= 10 AND price <= 100
ORDER BY price ASC;`,
  },
  {
    label: 'Multiple namespaces',
    query: `// Fetch users, projects, and tags in one query
db.useQuery({
  users: {},
  projects: {},
  tags: {},
});`,
    result: `{
  "users": [
    { "id": u1Id, "name": "Alice" },
    { "id": u2Id, "name": "Bob" },
    ...
  ],
  "projects": [
    { "id": pj1Id, "name": "Website redesign" },
    ...
  ],
  "tags": [
    { "id": tg1Id, "label": "urgent" },
    ...
  ]
}`,
    sql: `-- Three separate queries
SELECT * FROM users;
SELECT * FROM projects;
SELECT * FROM tags;`,
  },
  {
    label: 'Filter by child',
    query: `// Fetch channels that have unread messages
db.useQuery({
  channels: {
    $: {
      where: {
        'messages.readAt': { $isNull: true },
      },
    },
    messages: {},
  },
});`,
    result: `{
  "channels": [
    {
      "id": ch1Id,
      "name": "general",
      "messages": [
        {
          "id": m1Id,
          "text": "Hey team!",
          "readAt": null
        },
        ...
      ]
    }
  ]
}`,
    sql: `SELECT c.*,
       COALESCE(
         (SELECT json_agg(m.*) FROM messages m
          WHERE m.channel_id = c.id AND m.read_at IS NULL),
         '[]'
       ) AS messages
FROM channels c
WHERE EXISTS (
  SELECT 1 FROM messages m
  WHERE m.channel_id = c.id AND m.read_at IS NULL
);`,
  },
  {
    label: '$in operator',
    query: `// Fetch orders matching specific statuses
db.useQuery({
  orders: {
    $: {
      where: {
        status: { $in: ['pending', 'shipped'] },
      },
    },
    items: {},
  },
});`,
    result: `{
  "orders": [
    {
      "id": o1Id,
      "status": "pending",
      "items": [...]
    },
    {
      "id": o2Id,
      "status": "shipped",
      "items": [...]
    }
  ]
}`,
    sql: `SELECT o.*,
       COALESCE(
         (SELECT json_agg(i.*) FROM items i WHERE i.order_id = o.id),
         '[]'
       ) AS items
FROM orders o
WHERE o.status IN ('pending', 'shipped');`,
  },
  {
    label: 'Published with relations',
    query: `// Fetch published articles with comments and tags
db.useQuery({
  articles: {
    $: {
      where: { published: true },
      order: { publishedAt: 'desc' },
    },
    comments: { author: {} },
    tags: {},
  },
});`,
    result: `{
  "articles": [
    {
      "title": "Intro to InstaQL",
      "published": true,
      "comments": [
        {
          "body": "Great post!",
          "author": { "name": "Alice" }
        }
      ],
      "tags": [{ "label": "tutorial" }]
    },
    ...
  ]
}`,
    sql: `SELECT a.*,
       COALESCE(
         (SELECT json_agg(json_build_object(
           'body', c.body,
           'author', (SELECT json_agg(u.*) FROM users u WHERE u.id = c.author_id)
         )) FROM comments c WHERE c.article_id = a.id),
         '[]'
       ) AS comments,
       COALESCE(
         (SELECT json_agg(t.*)
          FROM article_tags at
          JOIN tags t ON t.id = at.tag_id
          WHERE at.article_id = a.id),
         '[]'
       ) AS tags
FROM articles a
WHERE a.published = true
ORDER BY a.published_at DESC;`,
  },
];

export const transactionExamples = [
  {
    label: 'Create',
    code: `// Create a new todo
db.transact(
  db.tx.todos[id()].update({
    title: "Ship the feature",
    completed: false,
    createdAt: Date.now(),
  })
);`,
  },
  {
    label: 'Update',
    code: `// Mark a todo as completed
db.transact(
  db.tx.todos[todoId].update({
    completed: true,
  })
);`,
  },
  {
    label: 'Delete',
    code: `// Delete multiple todos at once
const deleteTxs = todoIds.map((todoId) =>
  db.tx.todos[todoId].delete()
);

db.transact(deleteTxs);`,
  },
  {
    label: 'Link',
    code: `// Assign a todo to a goal
db.transact(
  db.tx.todos[todoId].link({
    goals: goalId,
  })
);`,
  },
  {
    label: 'Unlink',
    code: `// Remove a todo from a goal
db.transact(
  db.tx.todos[todoId].unlink({
    goals: goalId,
  })
);`,
  },
  {
    label: 'Lookup',
    code: `// Upsert a user by email
db.transact(
  db.tx.users.lookup("email", "alice@company.com").update({
    name: "Alice",
    role: "admin",
  })
);`,
  },
  {
    label: 'Batch',
    code: `// Create a goal with todos in one transaction
const goalId = id();
db.transact([
  db.tx.goals[goalId].update({
    title: "Launch v2",
  }),
  db.tx.todos[id()].update({
    title: "Write tests",
    completed: false,
  }).link({ goals: goalId }),
  db.tx.todos[id()].update({
    title: "Deploy to prod",
    completed: false,
  }).link({ goals: goalId }),
]);`,
  },
];

export const typeSafetyBlocks = [
  {
    label: 'Typed queries',
    code: `import { i, init } from "@instantdb/react";

// Define a typed schema
const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      completed: i.boolean(),
      createdAt: i.date(),
    }),
  },
});

const db = init({ appId: APP_ID, schema });

// Query results are fully typed from your schema
const { data } = db.useQuery({ todos: {} });

// data.todos[0].title       -> string
// data.todos[0].completed   -> boolean`,
  },
  {
    label: 'Typed transactions',
    code: `import { InstaQLEntity, id } from "@instantdb/react";

type Todo = InstaQLEntity<AppSchema, "todos">;

// Attributes are type-checked against the schema
function addTodo(title: string) {
  db.transact(
    db.tx.todos[id()].update({
      title,
      completed: false,
      createdAt: Date.now(),
    })
  );
}

// Parameters are typed too -- todo.id and todo.completed are inferred
function toggle(todo: Todo) {
  db.transact(
    db.tx.todos[todo.id].update({
      completed: !todo.completed,
    })
  );
}`,
  },
];
