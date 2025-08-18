import { i, id } from '@instantdb/core';
import { useEffect, useState } from 'react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().unique().indexed(),
      completed: i.boolean(),
      createdAt: i.number(),
    }),
  },
});

const history: any[] = [];

function AlwaysResultComponent({ db }: { db: any }) {
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const { data } = db.useQuery({
    todos: {
      $: {
        order: {
          title: undefined,
        },
      },
    },
  });

  history.push(data);

  useEffect(() => {
    db._core.getAuth().then((auth: any) => {
      console.log('auth result', auth);
    });
  }, []);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;

    db.transact(
      db.tx.todos[id()].update({
        title: newTodoTitle.trim(),
        completed: false,
        createdAt: Date.now(),
      }),
    );
    setNewTodoTitle('');
  };

  const toggleTodo = (todoId: string, completed: boolean) => {
    db.transact(db.tx.todos[todoId].update({ completed: !completed }));
  };

  const deleteTodo = (todoId: string) => {
    db.transact(db.tx.todos[todoId].delete());
  };

  return (
    <div className="min-w-[70vw] p-6 bg-white rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Todo List</h1>

      <form onSubmit={addTodo} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            placeholder="Add a new todo..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {data.todos?.map((todo: any) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 p-3 border border-gray-200 rounded-md"
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span
              className={`flex-1 ${
                todo.completed ? 'line-through text-gray-500' : 'text-gray-900'
              }`}
            >
              {todo.title}
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
        <p className="text-center text-gray-500 mt-6">
          No todos yet. Add one above!
        </p>
      )}

      <div>HISTORY</div>
      <pre>{JSON.stringify(history, null, 2)}</pre>
    </div>
  );
}

export default function AlwaysResultPage() {
  return (
    <div className="max-w-lg flex flex-col py-4 px-4">
      <div>
        This is a todo app with always result data tracking and history logging.
      </div>
      <EphemeralAppPage schema={schema} Component={AlwaysResultComponent} />
    </div>
  );
}
