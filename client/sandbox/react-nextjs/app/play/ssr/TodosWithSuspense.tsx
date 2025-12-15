'use client';

import { db } from './db';

export const TodosWithSuspense = () => {
  const user = db.useAuth();
  const { data: todos } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
      },
    },
  });

  return (
    <div className="m-2 border-4 border-green-500 p-2">
      USER: <pre>{JSON.stringify(user, null, 2)}</pre>
      <h1>With Suspense / SSR</h1>
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </div>
  );
};
