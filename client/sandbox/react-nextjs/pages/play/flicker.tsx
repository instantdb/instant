// playgrounds/TodoFlickerExample.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  id,
  i,
  InstantReactAbstractDatabase,
  InstaQLEntity,
} from '@instantdb/react';

import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      description: i.string(),
      checked: i.boolean(),
      order: i.number(),
    }),
  },
});

type Todo = InstaQLEntity<typeof schema, 'todos'>;

function TodoMain({
  db,
  todos,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  todos: Todo[];
}) {
  const [changes, setChanges] = useState<number[]>([]);
  const interval = useRef<NodeJS.Timer | null>(null);
  function toggleUpdates() {
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
      return null;
    }
    let idx = -1;
    let _todos = todos;
    interval.current = setInterval(() => {
      idx = (idx + 1) % _todos.length;
      const todo = _todos[idx];
      db.transact(
        db.tx.todos[todo.id].update({
          checked: !todo.checked,
        }),
      );
      _todos = _todos.map((t) => {
        if (t.id === todo.id) {
          return { ...t, checked: !t.checked };
        }
        return t;
      });
    }, 10);
  }
  const prevTodosRef = useRef<Todo[]>(todos);
  useEffect(() => {
    const prevTodos = prevTodosRef.current;
    const differences = todos
      .map((currTodo, idx) => {
        const prevTodo = prevTodos[idx] as Todo;
        return currTodo.checked !== prevTodo.checked ? idx : null;
      })
      .filter((x) => Number.isInteger(x)) as number[];

    setChanges((prev) => [...prev, ...differences]);
    prevTodosRef.current = todos;
  }, [todos]);

  const chunks: number[][] = [];
  for (let i = 0; i < changes.length; i += 3) {
    if (i + 3 > changes.length) {
      break;
    }
    chunks.push(changes.slice(i, i + 3));
  }
  return (
    <div className="p-4">
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={async () => {
            await db.transact(
              todos.map((todo) =>
                db.tx.todos[todo.id].update({ checked: false }),
              ),
            );
            window.location.reload();
          }}
        >
          Reset Todos
        </button>
        <button className="bg-black text-white m-2 p-2" onClick={toggleUpdates}>
          Toggle Updates
        </button>
      </div>
      <div>
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center">
            <input
              type="checkbox"
              checked={todo.checked}
              onChange={(e) => {
                db.transact(
                  db.tx.todos[todo.id].update({ checked: e.target.checked }),
                );
              }}
            />
            <span className="ml-2">{todo.title}</span>
          </div>
        ))}
      </div>
      <div className="flex space-x-1 flex-wrap">
        {chunks.map((chunk, idx) => {
          const [a, b, c] = chunk;
          const isCorrect = a === 0 && b === 1 && c === 2;
          return (
            <div
              key={idx}
              className={`rounded-sm ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`}
            >
              {a}, {b}, {c}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const { isLoading, error, data } = db.useQuery({ todos: {} });
  if (isLoading) return null;
  if (error) return <div>Error: {error.message}</div>;
  const todos = data.todos.toSorted((a, b) => a.order - b.order);
  return <TodoMain db={db} todos={todos} />;
}

export default function Page() {
  return (
    <EphemeralAppPage
      schema={schema}
      onCreateApp={async (db) => {
        const longText =
          'This is long. Why? So the update is slow enough to trigger flickers. '
            .repeat(1000)
            .trim();
        const initialTodos = [0, 1, 2].map((order) => {
          return {
            title: `Todo ${order}`,
            description: longText,
            checked: false,
            order,
          };
        });
        await db.transact(
          initialTodos.map((todo) => db.tx.todos[id()].update(todo)),
        );
      }}
      Component={Example}
    />
  );
}
