'use client';
import { db, useSuspenseQuery } from './db';

export const TodosWithoutSuspense = () => {
  const { data: todos, isLoading } = db.useQuery({
    todos: {},
  });

  return (
    <div className="border-4 p-2 m-2 border-red-500">
      <h1>Without SSR</h1>
      {isLoading && <div>Loading...</div>}
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </div>
  );
};
