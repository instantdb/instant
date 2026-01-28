import { useEffect, useState } from 'react';

import { tx, id, i, InstantReactAbstractDatabase } from '@instantdb/react';

import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().unique().indexed(),
      completed: i.boolean(),
      createdAt: i.date().optional().indexed(),
    }),
    note: i.entity({
      desc: i.string(),
    }),
  },

  links: {
    todoNote: {
      forward: {
        on: 'todos',
        has: 'many',
        required: false,
        label: 'notes',
      },
      reverse: {
        on: 'note',
        has: 'one',
        required: false,
        label: 'todo',
      },
    },
  },
  //...
});

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const { data } = db.useQuery({
    todos: {
      notes: {
        $: {
          // @ts-ignore
          limit: 2,
        },
      },
    },
  });

  useEffect(() => {
    // db._core.auth.signInWithMagicCode({
    //   code:
    // });
    db.core.getAuth().then((auth) => {
      console.log('auth result', auth);
    });
  }, []);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;

    const todoId = id();

    const noteLinks = [];

    for (let i = 0; i < 10; i++) {
      noteLinks.push(
        db.tx.note[id()]
          .create({
            desc: 'note: ' + i,
          })
          .link({ todo: todoId }),
      );
    }

    db.transact([
      db.tx.todos[todoId].create({
        completed: false,
        title: newTodoTitle.trim(),
        createdAt: Date.now(),
      }),
      ...noteLinks,
    ]);

    setNewTodoTitle('');
  };

  const toggleTodo = (todoId: string, completed: boolean) => {
    db.transact(db.tx.todos[todoId].update({ completed: !completed }));
  };

  const deleteTodo = (todoId: string) => {
    db.transact(db.tx.todos[todoId].delete());
  };

  return (
    <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-lg">
      <h1 className="mb-6 text-center text-2xl font-bold">Todo List</h1>
      <div>Each todo has 10 "notes" which get created along with the todo</div>
      <form onSubmit={addTodo} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            placeholder="Add a new todo..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            Add
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {data?.todos?.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 rounded-md border border-gray-200 p-3"
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <span
              className={`flex-1 ${
                todo.completed ? 'text-gray-500 line-through' : 'text-gray-900'
              }`}
            >
              {todo.title}
            </span>
            <span>
              {todo.notes?.map((note) => (
                <div key={note.id}>{note.desc}</div>
              ))}
            </span>
            <button
              onClick={() => deleteTodo(todo.id)}
              className="px-2 py-1 text-red-600 hover:text-red-800 focus:outline-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {data?.todos?.length === 0 && (
        <p className="mt-6 text-center text-gray-500">
          No todos yet. Add one above!
        </p>
      )}

      <div className="mt-6 text-xs text-gray-400">
        <details>
          <summary className="cursor-pointer">Debug Data</summary>
          <pre className="mt-2 overflow-auto text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={Example} />;
}
