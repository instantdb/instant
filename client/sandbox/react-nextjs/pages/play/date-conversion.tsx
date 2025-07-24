'use client';
import config from '../../config';
import { init, i, id } from '@instantdb/react';
import { useRouter } from 'next/router';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';

const exampleTodos = [
  'Water the plants',
  'Feed the cat',
  'Make the bed',
  'Do the laundry',
  'Wash the car',
  'Buy the groceries',
  'Clean the house',
  'Do the dishes',
];

const getRandomTodo = () =>
  exampleTodos[Math.floor(Math.random() * exampleTodos.length)];

const dateTypes = {
  number: new Date().getTime(),
  string: new Date().toISOString(),
  jsonString: new Date().toJSON(),
  invalidJsonString: JSON.stringify(new Date()),
  invalidString: 'invalid',
  requiresSpecialParsing: '2025-01-02T00:00:00-08',
};

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().indexed(),
      completed: i.boolean(),
      createdAt: i.date(),
    }),
  },
});

function Example({ appId }: { appId: string }) {
  const searchParams = useSearchParams();
  const myConfig = { ...config, appId };
  const db = init({
    ...myConfig,
    schema,
    useDateObjects: searchParams?.get('useDateObjects') === 'true',
  });
  const q = db.useQuery({ todos: {} });
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const handleAdd = async (title: string, dateType: keyof typeof dateTypes) => {
    try {
      await db.transact([
        db.tx.todos[id()].update({
          title: title,
          completed: false,
          createdAt: dateTypes[dateType],
        }),
      ]);
    } catch (e: any) {
      console.error('Error adding todo', e);
      setErrorMessages((prev) => [...prev, e.message]);
    }
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
      Using Date Params:{' '}
      {searchParams?.get('useDateObjects') === 'true' ? 'true' : 'false'}
      <div className="flex gap-2">
        {Object.keys(dateTypes).map((type) => (
          <button
            className="p-2 border"
            key={type}
            onClick={() => handleAdd(getRandomTodo(), type as any)}
          >
            Add Todo with {type}
          </button>
        ))}
      </div>
      <div>
        {errorMessages.map((m, i) => (
          <div key={i} className="text-red-500">
            {m}
          </div>
        ))}
      </div>
      <div className="pt-4">
        {q.data?.todos.map((m) => (
          <div
            className="px-8"
            key={m.id}
            style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}
          >
            <input
              type="checkbox"
              className="mr-4"
              checked={m.completed}
              onChange={() => handleComplete(m.id)}
            />
            <span style={{ flex: 1 }}>{m.title}</span>
            <span style={{ flex: 1 }}>Type of date: {typeof m.createdAt}</span>
            {m.createdAt instanceof Date && (
              <span style={{ flex: 1 }}>
                Created at: {m.createdAt.toLocaleString()}
              </span>
            )}
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
