import config from '@/lib/config'; // hide-line
import { id, init } from '@instantdb/react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

export default function InstantTodos() {
  const { data, isLoading, error } = db.useQuery({
    todos: {},
  });

  if (error)
    return <p className="p-4 flex items-center">Oops, something broke</p>;

  return (
    <div className="flex flex-col p-4 gap-2">
      <h1 className="font-bold text-lg">InsTodo</h1>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const todoInput = form.elements.namedItem('todo') as HTMLInputElement;
          const text = todoInput?.value;

          if (!text) return;

          form.reset();

          db.transact([
            db.tx.todos[id()].update({
              text,
              completed: false,
            }),
          ]);
        }}
      >
        <input className="py-1 border-gray-300" type="text" name="todo" />
        <button type="submit" className="bg-blue-500 text-white p-1 font-bold">
          Add todo
        </button>
      </form>
      {isLoading ? (
        <p className="italic text-gray-700">Loading...</p>
      ) : data?.todos.length ? (
        <ul>
          {data.todos.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center justify-between gap-2"
            >
              <label className="truncate">
                <input
                  type="checkbox"
                  className="align-middle"
                  checked={todo.completed}
                  onChange={(e) => {
                    db.transact([
                      db.tx.todos[todo.id].update({
                        completed: e.currentTarget.checked,
                      }),
                    ]);
                  }}
                />{' '}
                <span
                  className={`align-middle ${
                    todo.completed ? 'line-through text-gray-400' : ''
                  }`}
                >
                  {todo.text}
                </span>
              </label>
              <button
                onClick={(e) => {
                  db.transact([db.tx.todos[todo.id].delete()]);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="italic text-gray-700">No todos!</p>
      )}
    </div>
  );
}
