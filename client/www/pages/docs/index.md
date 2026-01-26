---
title: Getting started
pageTitle: Instant - The Modern Firebase.
description: How to use Instant with React
---

Instant is the easy to use backend for your frontend. With Instant you can build delightful apps in less than 10 minutes. Follow the quick start below to **build a live app!**

{% callout type="note" %}
For a more step-by-step tutorial on how to use Instant, check out our [Todo List Tutorial](/examples/todos)
{% /callout %}

## Automatic Setup With Create Instant App

The fastest way to get started with Instant is to use `npx create-instant-app` to scaffold a new project with Instant already set up.

To get started with Next.JS run:

```bash {% showCopy=true %}
npx create-instant-app --next
```


## Manual Setup

To create a new Next project, fire up your terminal and run the following:

```shell {% showCopy=true %}
npx create-next-app instant-demo --tailwind --yes
cd instant-demo
npm run dev
```

Add the InstantDB React Library:

```shell
npm i @instantdb/react
```

Setup and connect your Instant app.
This will log you in if you are not logged in already, then create a schema and permissions file, and update your `.env` file.

```shell
npx instant-cli init
```

Create a database client in `src/lib/db.ts`:

{% file label="src/lib/db.ts" /%}
```ts
import { init } from '@instantdb/react';
import schema from '../instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
});
```

You're now ready to make queries and transactions to your database!

### Creating a To-Do List App

Let's add a "todo" entity to our schema file at `src/instant.schema.ts`:

{% file label="src/instant.schema.ts" /%}
```ts {% showCopy=true lineHighlight="14-18" %}
import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.date(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: '$users',
        has: 'one',
        label: 'linkedPrimaryUser',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'linkedGuestUsers',
      },
    },
  },
  rooms: {},
});

//...
```

Push the schema:

```shell {% showCopy=true %}
npx instant-cli push
```

### Reading Data

Replace the content of `src/app/page.tsx` with the following:

{% file label="src/app.page.tsx" /%}
```typescript {% showCopy=true %}
"use client";

import schema from "@/instant.schema";
import { db } from "@/lib/db";
import { id, i, init, InstaQLEntity } from "@instantdb/react";

type Todo = InstaQLEntity<typeof schema, "todos", {}, undefined, true>;

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ todos: {} });
  if (isLoading) {
    return;
  }
  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }
  const { todos } = data;
  return (
    <div className="font-mono min-h-screen flex justify-center items-center flex-col space-y-4">
      <h2 className="tracking-wide text-5xl text-gray-300">todos</h2>
      <div className="border border-gray-300 max-w-xs w-full">
        <TodoForm todos={todos} />
        <TodoList todos={todos} />
        <ActionBar todos={todos} />
      </div>
      <div className="text-xs text-center">
        Open another tab to see todos update in realtime!
      </div>
    </div>
  );
}

// Write Data
// ---------
function addTodo(text: string) {
  db.transact(
    db.tx.todos[id()].update({
      text,
      done: false,
      createdAt: Date.now(),
    }),
  );
}

function deleteTodo(todo: Todo) {
  db.transact(db.tx.todos[todo.id].delete());
}

function toggleDone(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteCompleted(todos: Todo[]) {
  const completed = todos.filter((todo) => todo.done);
  const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
  db.transact(txs);
}

function toggleAll(todos: Todo[]) {
  const newVal = !todos.every((todo) => todo.done);
  db.transact(
    todos.map((todo) => db.tx.todos[todo.id].update({ done: newVal })),
  );
}

// Components
// ----------
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20">
      <path
        d="M5 8 L10 13 L15 8"
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
      />
    </svg>
  );
}

function TodoForm({ todos }: { todos: Todo[] }) {
  return (
    <div className="flex items-center h-10 border-b border-gray-300">
      <button
        className="h-full px-2 border-r border-gray-300 flex items-center justify-center"
        onClick={() => toggleAll(todos)}
      >
        <div className="w-5 h-5">
          <ChevronDownIcon />
        </div>
      </button>
      <form
        className="flex-1 h-full"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.input as HTMLInputElement;
          addTodo(input.value);
          input.value = "";
        }}
      >
        <input
          className="w-full h-full px-2 outline-hidden bg-transparent"
          autoFocus
          placeholder="What needs to be done?"
          type="text"
          name="input"
        />
      </form>
    </div>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <div className="divide-y divide-gray-300">
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-center h-10">
          <div className="h-full px-2 flex items-center justify-center">
            <div className="w-5 h-5 flex items-center justify-center">
              <input
                type="checkbox"
                className="cursor-pointer"
                checked={todo.done}
                onChange={() => toggleDone(todo)}
              />
            </div>
          </div>
          <div className="flex-1 px-2 overflow-hidden flex items-center">
            {todo.done ? (
              <span className="line-through">{todo.text}</span>
            ) : (
              <span>{todo.text}</span>
            )}
          </div>
          <button
            className="h-full px-2 flex items-center justify-center text-gray-300 hover:text-gray-500"
            onClick={() => deleteTodo(todo)}
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ todos }: { todos: Todo[] }) {
  return (
    <div className="flex justify-between items-center h-10 px-2 text-xs border-t border-gray-300">
      <div>Remaining todos: {todos.filter((todo) => !todo.done).length}</div>
      <button
        className=" text-gray-300 hover:text-gray-500"
        onClick={() => deleteCompleted(todos)}
      >
        Delete Completed
      </button>
    </div>
  );
}

export default App;
```

Go to `localhost:3000`, and huzzah 🎉 You've got a fully functional todo list running!

Check out the [Working with data](/docs/init) section to learn more about how to use Instant :)
