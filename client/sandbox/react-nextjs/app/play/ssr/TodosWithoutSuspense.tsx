'use client';
import { db } from './db';

const TodoWithoutSuspense = ({ id }: { id: string }) => {
  const { data, isLoading, error } = db.useQuery({
    todos: {
      $: {
        where: { id: id },
      },
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error.message}</div>;
  }

  const todo = data.todos[0];

  return <div>{JSON.stringify(todo, null, 2)}</div>;
};

export const TodosWithoutSuspense = () => {
  const { data, isLoading } = db.useQuery({
    todos: {
      $: {
        limit: 100,
        order: { serverCreatedAt: 'desc' },
      },
    },
  });

  const user = db.useAuth();

  return (
    <div className="m-2 overflow-auto border-4 border-red-500 p-2">
      USER:{' '}
      <pre className="overflow-auto text-xs">
        {JSON.stringify(user, null, 2)}
      </pre>
      <h1>Without SSR</h1>
      {isLoading && <div>Loading...</div>}
      <pre className="overflow-auto text-xs">
        {data?.todos.map((t) => (
          <TodoWithoutSuspense key={t.id} id={t.id} />
        ))}
      </pre>
    </div>
  );
};
