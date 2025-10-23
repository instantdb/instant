'use client';

import SuspenseTodos from '@/components/suspense-todos';
import { db } from '@/lib/db';
import { id } from '@instantdb/react';
import React, { Suspense } from 'react';

export default function () {
  const result = db.useQuery({
    todos: {
      $: {
        limit: 20,
        offset: 1,
      },
    },
  });

  const addTodo = () => {
    db.transact(
      db.tx.todos[id()].create({
        createdAt: new Date(),
        done: false,
        text: 'Hello at ' + new Date().toLocaleString(),
      }),
    );
  };

  return (
    <div>
      TODOS
      <button onClick={() => addTodo()}>Add Todo</button>
      <Suspense fallback={<div>Loading.</div>}>
        <SuspenseTodos />
      </Suspense>
      <hr></hr>
      <pre>{JSON.stringify(result, null, 2)}</pre>
      <div>
        Date Test:{' '}
        {result?.data?.todos[0]
          ? result?.data?.todos[0].createdAt.toLocaleString()
          : 'Loading...'}
      </div>
    </div>
  );
}
