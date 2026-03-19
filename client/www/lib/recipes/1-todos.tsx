import { id } from '@instantdb/react';
import { useRecipeDB } from './db';

export default function InstantTodos() {
  const db = useRecipeDB();
  const { data, isLoading, error } = db.useQuery({ todos: {} });

  if (error) return <p className="p-4 text-red-500">Oops, something broke</p>;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4 px-4 pt-8">
      <h1 className="text-xl font-semibold tracking-tight text-gray-800">
        instado
      </h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            'todo',
          ) as HTMLInputElement;
          if (!input.value) return;
          db.transact([
            db.tx.todos[id()].update({ text: input.value, completed: false }),
          ]);
          e.currentTarget.reset();
        }}
      >
        <input
          name="todo"
          type="text"
          placeholder="What needs to be done?"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Add
        </button>
      </form>
      {data?.todos.length ? (
        <ul className="flex flex-col">
          {data.todos.map((todo) => (
            <li
              key={todo.id}
              className="group flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="accent-orange-600"
                checked={todo.completed}
                onChange={(e) =>
                  db.transact([
                    db.tx.todos[todo.id].update({
                      completed: e.currentTarget.checked,
                    }),
                  ])
                }
              />
              <span
                className={`flex-1 text-sm ${todo.completed ? 'text-gray-300 line-through' : 'text-gray-700'}`}
              >
                {todo.text}
              </span>
              <button
                onClick={() => db.transact([db.tx.todos[todo.id].delete()])}
                className="text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : isLoading ? null : (
        <p className="text-sm text-gray-400 italic">
          No todos just yet! Create your first one :)
        </p>
      )}
    </div>
  );
}
