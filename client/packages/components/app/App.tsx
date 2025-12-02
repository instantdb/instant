import { useState } from 'react';
import './App.css';
import { Explorer } from '../src/index';

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <Explorer
        appId="59cb9109-0e5c-4735-8775-4369d0486d0b"
        adminToken="59cb9109-0e5c-4735-8775-4369d0486d0b"
      />
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
