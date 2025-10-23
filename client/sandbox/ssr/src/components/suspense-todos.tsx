'use client';

import { useSuspenseQuery } from '@/lib/db';
import React from 'react';

export default function () {
  const response = useSuspenseQuery({
    todos: {
      $: {
        limit: 20,
      },
    },
  });

  return (
    <div>
      HI Sus + {JSON.stringify(response)}
      <div>
        Date Test: {response.data.todos[0]?.createdAt.toLocaleDateString()}
      </div>
    </div>
  );
}
