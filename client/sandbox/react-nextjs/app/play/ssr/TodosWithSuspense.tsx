'use client';

import { db } from './db';

const TodoWithSuspense = ({ id }: { id: string }) => {
  const { data } = db.useSuspenseQuery({
    todos: {
      $: {
        where: { id: id },
      },
    },
  });

  const todo = data.todos[0];

  return <div>{JSON.stringify(todo, null, 2)}</div>;
};

export const TodosWithSuspense = () => {
  const user = db.useAuth();
  const { data } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
        order: { serverCreatedAt: 'desc' },
      },
    },
  });

  return (
    <div className="m-2 overflow-auto border-4 border-green-500 p-2">
      USER:{' '}
      <pre className="overflow-auto text-xs">
        {JSON.stringify(user, null, 2)}
      </pre>
      <h1>With Suspense / SSR</h1>
      <pre className="overflow-auto text-xs">
        {data.todos.map((t) => (
          <TodoWithSuspense key={t.id} id={t.id} />
        ))}
      </pre>
    </div>
  );
};
