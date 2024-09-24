import {
  i,
  init_experimental,
  type InstantQuery,
  type InstantQueryResult,
} from "@instantdb/react";
import config from "../../config";

const schema = i.graph(
  {
    todos: i.entity({
      text: i.string(),
      completed: i.boolean(),
    }),
  },
  {},
);

const db = init_experimental({
  ...config,
  schema,
});

type DB = typeof db;

const todosQuery = {
  todos: {},
} satisfies InstantQuery<DB>;

export type Todos = InstantQueryResult<DB, typeof todosQuery>["todos"];

export default function TodoApp() {
  const result = db.useQuery(todosQuery);

  if (!result.data) return null;

  return <TodoList todos={result.data.todos} />;
}

// a react component using `Todos`
function TodoList({ todos }: { todos: Todos }) {
  // render todos...
  return "Number of todos: " + todos.length;
}
