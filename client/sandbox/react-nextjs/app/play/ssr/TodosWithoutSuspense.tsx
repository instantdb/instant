'use client';
import { db } from './db';

export const TodosWithoutSuspense = () => {
  const { data: todos, isLoading } = db.useQuery({
    todos: {},
  });

  const user = db.useAuth();

  return (
    <div className="m-2 border-4 border-red-500 p-2">
      <pre>{JSON.stringify(user, null, 2)}</pre>
      <h1>Without SSR</h1>
      {isLoading && <div>Loading...</div>}
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </div>
  );
};
