'use client';

import { db, useSuspenseQuery } from '@/lib/db';
import React from 'react';

export default function () {
  const response = useSuspenseQuery({
    todos: {
      $: {
        offset: 1,
        limit: 20,
      },
    },
  });

  const susus = db.useQuery({
    todos: {
      $: {
        offset: 1,
        limit: 20,
      },
    },
  });

  return (
    <div>
      HI Sus + {JSON.stringify(response)}
      HI nonsus + {JSON.stringify(susus)}{' '}
      <div>
        Date Test: {response.data.todos[0]?.createdAt.toLocaleDateString()}
      </div>
    </div>
  );
}
