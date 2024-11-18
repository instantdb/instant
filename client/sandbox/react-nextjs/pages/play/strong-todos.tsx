import {
  i,
  init_experimental,
  InstaQLEntity,
  type InstaQLParams,
  type InstaQLResult,
} from "@instantdb/react";

import config from "../../config";

const schema = i.graph(
  {
    todos: i.entity({
      text: i.string(),
      completed: i.boolean(),
    }),
    owner: i.entity({
      name: i.string(),
    }),
  },
  {
    todosOwner: {
      forward: {
        on: "todos",
        has: "one",
        label: "owner",
      },
      reverse: {
        on: "owner",
        has: "many",
        label: "ownedTodos",
      },
    },
  },
);
type _Schema = typeof schema;
// This is a little hack that makes
// Typescript intellisense look a lot cleaner
interface Schema extends _Schema {}

const db = init_experimental({
  ...config,
  schema,
});

const todosQuery = {
  todos: {
    owner: {},
  },
} satisfies InstaQLParams<Schema>;

export type Todo = InstaQLEntity<Schema, "todos">;

export default function TodoApp() {
  const result = db.useQuery(todosQuery);

  if (!result.data) return null;

  return <TodoList todos={result.data.todos} />;
}

// a react component using `Todos`
function TodoList({ todos }: { todos: Todo[] }) {
  // render todos...
  return "Number of todos: " + todos.length;
}
