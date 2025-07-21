import config from '../../config';
import { init, i, id } from '@instantdb/react';
import { useRouter } from 'next/router';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import React from 'react';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().unique().indexed(),
      completed: i.boolean(),
      createdAt: i.date(),
    }),
  },
});

function Example({ appId }: { appId: string }) {
  const myConfig = { ...config, appId };
  const db = init({ ...myConfig, schema, useDateObjects: true });
  const q = db.useQuery({ todos: {} });

  const [newTodo, setNewTodo] = React.useState('');

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    // const newTodoId = id();
    await db.transact([
      db.tx.todos[id()].update({
        title: newTodo,
        completed: false,
        createdAt: new Date(),
      }),
    ]);
    setNewTodo('');
  };

  const handleDelete = async (todoId: string) => {
    await db.transact(db.tx.todos[todoId].delete());
  };

  const handleComplete = async (todoId: string) => {
    const current = q.data?.todos.find((m) => m.id === todoId)?.completed;
    await db.transact(db.tx.todos[todoId].update({ completed: !current }));
  };

  return (
    <div>
      <form onSubmit={handleAdd} style={{ marginBottom: 16 }}>
        <input
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add todo"
        />
        <button type="submit">Add</button>
      </form>
      <div>
        {q.data?.todos.map((m) => (
          <div
            className="px-8"
            key={m.id}
            style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={m.completed}
              onChange={() => handleComplete(m.id)}
            />
            <span style={{ flex: 1 }}>{m.title}</span>
            <span style={{ flex: 1 }}>Type of date: {typeof m.createdAt}</span>
            <button
              onClick={() => handleDelete(m.id)}
              style={{ marginLeft: 8 }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Page() {
  const router = useRouter();

  if (!router.isReady) {
    return <div>Loading...</div>;
  }
  return <EphemeralAppPage Component={Example} schema={schema} />;
}

export default Page;
