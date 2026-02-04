---
title: Getting started with TanStack Start
description: How to use Instant with TanStack Start
---

{% callout type="note" %}
For a more step-by-step tutorial on how to use Instant, check out our [Todo List Tutorial](/examples/todos)
{% /callout %}

## Automatic Setup With Create Instant App

The fastest way to get started with Instant on TanStack Start is to use npx create-instant-app to scaffold a new project with Instant already set up.

To get started run:

```shell
npx create-instant-app -b tanstack-start
```

## Manual Setup

{% callout type="warning" %}

While the follwing setup guide demonstrates the basics for managing data, the automatic setup above includes a basic sign-up flow and utilities to access user information while running code on the server.

{% /callout %}

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
  appId: process.env.VITE_INSTANT_APP_ID!,
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

Replace the content of `src/routes/index.tsx` with the following:

{% file label="src/routes/index.tsx" /%}

```typescript {% showCopy=true %}
import { createFileRoute } from "@tanstack/react-router";
import { AppSchema } from "../instant.schema";
import { id, InstaQLEntity } from "@instantdb/react";
import { db } from "@/lib/db";

export const Route = createFileRoute("/")({
  component: App,
});

type Todo = InstaQLEntity<AppSchema, "todos">;

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ todos: {} });

  if (isLoading) {
    return null;
  }
  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }

  const { todos } = data;
  return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col">
        <h2 className="tracking-wide text-[#F54A00] pb-2 text-2xl">Todos</h2>
        <div className="text-xs pb-4">
          Open another tab to see todos update in realtime!
        </div>
        <div className="border rounded border-neutral-300">
          <TodoForm />
          <TodoList todos={todos} />
          <ActionBar todos={todos} />
        </div>
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
  if (completed.length === 0) return;
  const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
  db.transact(txs);
}

function TodoForm() {
  return (
    <div className="flex items-center h-10 border-neutral-300">
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
          className="w-full h-full px-2 outline-none bg-transparent"
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
    <div className="divide-y divide-neutral-300">
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
            className="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
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
    <div className="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300">
      <div>Remaining todos: {todos.filter((todo) => !todo.done).length}</div>
      <button
        className=" text-neutral-300 hover:text-neutral-500"
        onClick={() => deleteCompleted(todos)}
      >
        Delete Completed
      </button>
    </div>
  );
}
```

Go to `localhost:3000`, and huzzah 🎉 You've got a fully functional todo list running!

Check out the [Working with data](/docs/init) section to learn more about how to use Instant :)

{% callout type="note" %}

For the advanced use case of integrating with TanStack Query and enabling SSR, refer to our [tanstack-start-with-tanstack-query](https://github.com/instantdb/instant/tree/main/examples/tanstack-start-with-tanstack-query) example.

It can be scaffolded using `npx create-instant-app -b tanstack-start-with-tanstack-query`.
{% /callout %}
