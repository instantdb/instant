import React from 'react';
import { useState } from 'react';
import { StyleMe } from './StyleMe.jsx';

export const HelloCounter = () => {
  const [count, setCount] = useState(0);

  return (
    <StyleMe>
      <div className="tw-preflight m-2 bg-blue-500">
        <p>this should be blue</p>
        <button onClick={() => setCount(count + 1)}>
          this should not be red
        </button>
        <p>Count: {count}</p>
      </div>
    </StyleMe>
  );
};
