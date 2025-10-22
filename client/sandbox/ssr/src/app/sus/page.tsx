'use client';

import { SuspsenseQueryContext } from '@instantdb/next';
import React from 'react';

export default function () {
  const hook = React.useContext(SuspsenseQueryContext);

  const response = hook({
    todos: {},
  });

  return <div>HI Sus + {JSON.stringify(response)}</div>;
}
