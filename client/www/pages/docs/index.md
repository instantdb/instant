---
title: Getting started
pageTitle: Instant - The Modern Firebase.
description: How to use Instant with React
---

Instant is the easy to use backend for your frontend. With Instant you can build delightful apps in less than 10 minutes. Follow the quick start below to **build a live app!**

# Create Instant App

The fastest way to get started with Instant is to use `npx create-instant-app` to scaffold a new project with Instant already set up.

To get started with Next.JS run:
```bash {% showCopy=true %}
npx create-instant-app --next
```

This will create a new Next.JS project with the following steps on this page already complete.

# Manual Setup
To use Instant in a new Next project, fire up your terminal and run the following:

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
This will create a schema and permissions file, and update your `.env` file.
```shell
npx instant-cli init
```

Create a database client in `src/lib/db.ts`:
```ts
// src/lib/db.ts
import { init } from "@instantdb/react";
import schema from "../instant.schema";

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
  useDateObjects: true,
});
```

You're now ready to make queries and transactions to your database!


## Creating a To-Do List App

Let's add a "todo" entity to our schema file at `src/instant.schema.ts`:

```ts {% showCopy=true lineHighlight="14-18" %}
import { i } from "@instantdb/react";

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
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
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
```typescript
"use client"
import { db } from "@/lib/db";

export default function Home() {
  const { data } = db.useQuery({
    todos: {},
  });

  return (
    <div>
      <h1>Todos</h1>
      {data?.todos.map((todo) => (
        <div key={todo.id}>
          <input type="checkbox" checked={todo.done} />
          <h2>{todo.text}</h2>
        </div>
      ))}
    </div>
  );
}
```

Open the [Explorer](https://www.instantdb.com/dash) with `npx instant-cli explorer` and create a new row in the "todos" namespace. As you make changes to the data, your website will update in real time.

### Writing Data
We can use `db.transact()` to create, delete, or update rows in our database.

When we make changes, the relevant queries automatically update.

The results of transactions appear instantly in the UI to keep things responsive, while changes are evaluated according to your [permissions](/docs/permissions) on the server.

```ts {% showCopy=true lineHighlight="4,7,12-21,27-40" %}
"use client";
import { db } from "@/lib/db";
import { id } from "@instantdb/react";
import { useState } from "react";

export default function Home() {
  const [inputText, setInputText] = useState("");
  const { data } = db.useQuery({
    todos: {},
  });

  const addTodo = async (text: string) => {
    db.transact(
      db.tx.todos[id()].create({
        text,
        createdAt: new Date(),
        done: false,
      }),
    );
    setInputText("");
  };

  return (
    <div>
      <h1>Todos</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTodo(inputText);
        }}
      >
        <input
          type="text"
          placeholder="Add todo"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      {data?.todos.map((todo) => (
        <div className="flex gap-2" key={todo.id}>
          <input type="checkbox" checked={todo.done} />
          <h2>{todo.text}</h2>
        </div>
      ))}
    </div>
  );
}
```
