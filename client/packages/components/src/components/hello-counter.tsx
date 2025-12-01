import { useState } from 'react';
import React from 'react';
import { StyleMe } from './StyleMe.jsx';

export const HelloCounter = () => {
  const [count, setCount] = useState(0);

  return (
    <StyleMe>
      <div className="tw-preflight bg-blue-500 p-2">
        <p>this should be blue!</p>
        <button onClick={() => setCount(count + 1)}>
          this should not be red
        </button>
        <p>Count: {count}</p>
      </div>
    </StyleMe>
  );
};
