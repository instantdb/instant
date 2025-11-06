[!video](https://www.youtube.com/watch?v=827EPRQ0ww0 'Build a Todo App in
<100 lines with InstantDB')

# Quickstart

Clone the repo and install dependencies:

```bash
# Clone repo
git clone https://github.com/instantdb/instant-examples

# Navigate into the todos example
cd instant-examples/todos

# Install dependencies
pnpm i
```

If you haven't already, be sure to log into the Instant CLI

```bash
pnpx instant-cli login
```

Now let's initialize a new app with the Instant CLI.

```bash
pnpx instant-cli init
```

We've provided a schema in `instant.schema.ts` that you can push to your app.
You may have already pushed this during `init` in the previous step. If you
answered 'no' to the prompt during init, or if you're unsure whether you pushed
the schema, you can push it now.

```bash
pnpx instant-cli push
```

Finally, run the development server:

```bash
pnpm run dev
```

# Walkthrough

We've written a brief companion guide that walks through the code in this app.
Use this as a reference as you explore the codebase!

1. [Setting up schema](#setting-up-schema)
1. [Initializing the database](#initializing-the-database)
1. [Querying todos](#querying-todos)
1. [Modifying todos](#modifying-todos)
1. [Test out real-time updates](#test-out-real-time-updates)
1. [Displaying active viewers](#displaying-active-viewers)
1. [Testing offline mode](#testing-offline-mode)
1. [Fin](#fin)

## Setting up schema

We define our database schema in a file called `instant.schema.ts`. By defining
our schema in code we can keep it in version control and get type-safety
throughout our app.

All apps built with Instant come with built-in user management and file storage,
you'll see them defined in the schema below as `$users` and `$files`.

For now that we're going to focus on todos. Specifically you can see we define
todos with properties: `isCompleted`, and `text` with their types.

We also define a room called `todos` which will be used to who's viewing the
todo app. More on that later!

<file label="instant.schema.ts"></file>

```tsx
const _schema = i.schema({
  entities: {
    // ... built-in entities
    todos: i.entity({
      isCompleted: i.boolean().optional(),
      text: i.string().optional(),
    }),
  },
  links: {
    // ... built-in links
  },
  rooms: {
    todos: {
      presence: i.entity({}),
    },
  },
});
```

This is all the schema we need for our todo app! There are many more features
you can use in your schema that we won't cover here, but you can learn more in
our [modeling data docs](/docs/modeling-data).

## Initializing the database

With our schema defined, we integrate it into our app with `init` from
`@instantdb/react`. We create a `lib/db.ts` file to initialize our connection to
the database and export it for use throughout our app.

<file label="src/lib/db.ts"></file>

```tsx
import { init } from '@instantdb/react';
import schema from '../instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!, // connect to your Instant app
  schema, // our schema from earlier, pass it here to enable type-safety
});
```

This is all the setup we need to use Instant in our app! `init` supports a few
additional options for customizing the database connection. We won't need them
for this app, but you can learn more in the [init docs](/docs/init).

## Querying todos

Fetching data from Instant is done with the `useQuery` hook. Not only will this
fetch the data, but it will also subscribe to real-time updates so that when
todos are added, updated, or deleted, our UI will automatically update to
reflect those changes.

<file label="src/app/page.tsx"></file>

```tsx
// This is similar to writing `SELECT * FROM todos` in SQL
const { isLoading, error, data } = db.useQuery({ todos: {} });
```

Fetching todos happens asynchronously, so we use the `isLoading` and `error`
states to handle loading and error states in our UI.

```tsx
// We can show a spinner or placeholder while fetching todos
// But sometimes it's nice to just render nothing to avoid layout flickers
if (isLoading) {
  return;
}

// There can be an error fetching data. For example if someone has never
// fetched todos before and go offline. Guarding against these error can provide
// helpful feedback to users.
if (error) {
  return <div className="p-4 text-red-500">Error: {error.message}</div>;
}
```

Once the query fulfills we can unpack the todos from the `data` object and
render them in our UI.

```tsx
function App() {
  // ... After loading and error handling
  // Unpack todos from data
  const { todos } = data;
  return (
    // ... Render the todo list somewhere in our app
    <TodoList todos={todos} />
  );
}

// We can now render todos as data in the same way we would
// as if they were local data.
function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <>
      {todos.map((todo) => (
        // ... Render each todo
      ))}
    </>
  );
}

// We can get type-safety for our entities from the schema
// If you change the schema this type will automagically update too!
type Todo = InstaQLEntity<AppSchema, "todos">;
```

For this app we just need to fetch all todos, but you can also filter, sort, and
paginate your queries. You can learn more about querying in our docs on [reading data](/docs/instaql).

## Modifying todos

We create, update, and delete todos using `db.transact` with one or more `db.tx`

You can think of a `db.transact` as a single "transaction" that can contain multiple
operations. Each operation is represented by a `db.tx`.

Here is how we create, delete, and toggle the done state of a todo:

<file label="src/app/page.tsx"></file>

```tsx
// id() generates a unique ID for the new todo
function createTodo(text: string) {
  db.transact(db.tx.todos[id()].create({ text }));
}

function deleteTodo(todoId: string) {
  db.transact(db.tx.todos[todoId].delete());
}

function toggleTodo(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ isCompleted: !todo.isCompleted }));
}
```

And here is how we operate on multiple todos in a single transaction:

<file label="src/app/page.tsx"></file>

```tsx
function deleteCompletedTodos(todoIds: string[]) {
  const txs = todoIds.map((todoId) => db.tx.todos[todoId].delete());
  db.transact(txs);
}

function toggleAllTodos(todos: Todo[]) {
  const notCompletedTodos = todos.filter((t) => !t.isCompleted);
  if (notCompletedTodos.length > 0) {
    db.transact(
      notCompletedTodos.map((t) =>
        db.tx.todos[t.id].update({ isCompleted: true }),
      ),
    );
  } else {
    db.transact(
      todos.map((t) => db.tx.todos[t.id].update({ isCompleted: false })),
    );
  }
}
```

We can hook these functions up to our UI elements, and when the transactions run
our query subscriptions will automatically update to reflect the changes. This
is similar to how `setState` works in React, but instead of just updating local state
we are updating the database!

These are all the transaction operations we need for our todo app, but there are
even more powerful operations you can use. To learn more, check out our docs on [writing
data](/docs/instaml).

## Test out real-time updates

Not only do queries automatically update when we modify data, but other users
who are viewing the same data will see the changes without needing to refresh! You can
test this out by opening the app in another tab, modify the todo list, and see
the changes appear in real-time.

## Displaying active viewers

We track and display the number of active viewers via `db.rooms.usePresence`.

<file label="src/app/page.tsx"></file>

```tsx
// Get number of users viewing this room
// Add 1 to include self
const { peers } = db.rooms.usePresence(db.room('todos'));
const numUsers = 1 + Object.keys(peers).length;
```

Here we join and subscribe to the `todo` room we defined in our schema earlier.
This means whenever someone else opens or closes the app, our `peers` object
will automatically update to reflect their presence.

This is just a basic example of using presence, but if you want to learn more
you can check out the example chat app or read [the presence
docs](/docs/presence-and-topics).

## Testing offline mode

Another great feature of Instant is that your app will continue to work even
when offline! You can test this out like in Chrome devtools like so:

- Open two tabs of the app
- In one tab, open Chrome devtools, go to the network tab, and select "Offline"
  in the throttling dropdown
- In the offline tab, add a few todos
- In the online tabs, make a few changes here too
- Now go back to the offline tab and disable offline mode, you should see all the changes
  sync up automatically!

The best part is that you don't need to write any special code to get offline
support -- it's all built-in with Instant!

## Fin

And with that you have a fully functioning todo app with real-time updates and
offline support! This covers the basics of using Instant, but if you want to see
more advanced features check out the other app examples or [read through our docs](/docs). Happy coding!
