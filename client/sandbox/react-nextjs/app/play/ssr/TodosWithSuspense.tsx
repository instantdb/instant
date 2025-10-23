'use client';

import { db } from './db';

export const TodosWithSuspense = () => {
  const { data: todos } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
      },
    },
  });

  return (
    <div className="border-4 p-2 m-2 border-green-500">
      <h1>With Suspense / SSR</h1>
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </div>
  );
};
