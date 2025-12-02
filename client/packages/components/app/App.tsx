import { useState } from 'react';
import './App.css';
import { HelloCounter } from '@lib';

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <HelloCounter></HelloCounter>
      <h1>Vite + React</h1>
      <div className="bg-blue-500">this should not be blue</div>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </>
  );
}

export default App;
