import {
  i,
  init_experimental,
  type InstantEntity,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchemaDatabase,
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
// for when your want to get the type of DB before calling `init`
type DB_alternate = InstantSchemaDatabase<typeof schema>;

const todosQuery = {
  todos: {},
} satisfies InstantQuery<DB>;

export type Todo = InstantEntity<DB, "todos">;

// alternatively
export type TodosResult = InstantQueryResult<DB, typeof todosQuery>["todos"];

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
