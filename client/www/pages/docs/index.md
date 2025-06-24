---
title: Getting started
pageTitle: Instant - The Modern Firebase.
description: How to use Instant with React
---

Instant is the Modern Firebase. With Instant you can easily build realtime and collaborative apps like Notion or Figma.

Curious about what it's all about? Try a {% blank-link href="https://instantdb.com/tutorial" label="demo" /%}. Have questions? {% blank-link href="https://discord.com/invite/VU53p7uQcE" label="Join us on discord!" /%}

And if you're ready, follow the quick start below to **build a live app in less than 5 minutes!**

## Quick start

To use Instant in a brand new project, fire up your terminal and run the following:

```shell {% showCopy=true %}
npx create-next-app instant-demo --tailwind --yes
cd instant-demo
npm i @instantdb/react
npm run dev
```

Now open up `app/page.tsx` in your favorite editor and replace the entirety of the file with the following code.

```typescript {% showCopy=true %}
"use client";

import { id, i, init, InstaQLEntity } from "@instantdb/react";

// Instant app
const APP_ID = "__APP_ID__";

// Optional: Declare your schema!
const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
  },
  rooms: {
    todos: {
      presence: i.entity({}),
    },
  },
});

type Todo = InstaQLEntity<typeof schema, "todos">;

const db = init({ appId: APP_ID, schema });
const room = db.room("todos");

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ todos: {} });
  const { peers } = db.rooms.usePresence(room);
  const numUsers = 1 + Object.keys(peers).length;
  if (isLoading) {
    return;
  }
  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }
  const { todos } = data;
  return (
    <div className="font-mono min-h-screen flex justify-center items-center flex-col space-y-4">
      <div className="text-xs text-gray-500">
        Number of users online: {numUsers}
      </div>
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
    })
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
    todos.map((todo) => db.tx.todos[todo.id].update({ done: newVal }))
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

Go to `localhost:3000`, aand huzzah 🎉 You've got your first Instant web app running! Check out the [Working with data](/docs/init) section to learn more about how to use Instant :)
