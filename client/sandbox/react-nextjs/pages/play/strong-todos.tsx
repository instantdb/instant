import {
  i,
  id,
  init,
  InstaQLEntity,
  type InstaQLParams,
} from '@instantdb/react';

import config from '../../config';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      completed: i.boolean(),
      author: i.string().optional(),
    }),
    owner: i.entity({
      name: i.string(),
    }),
  },
  links: {
    todosOwner: {
      forward: {
        on: 'todos',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: 'owner',
        has: 'many',
        label: 'ownedTodos',
      },
    },
  },
});
// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

const db = init({
  ...config,
  schema,
});

const todosQuery = {
  todos: {
    owner: {},
  },
} satisfies InstaQLParams<AppSchema>;

export type Todo = InstaQLEntity<AppSchema, 'todos'>;

function addTodo(text: string) {
  db.transact(
    db.tx.todos[id()].create({
      text: '',
      completed: false,
      author: 'aaa',
    }),
  );
}

export default function TodoApp() {
  const result = db.useQuery(todosQuery);

  if (!result.data) return null;

  return <TodoList todos={result.data.todos} />;
}

// a react component using `Todos`
function TodoList({ todos }: { todos: Todo[] }) {
  // render todos...
  return 'Number of todos: ' + todos.length;
}
