import { useState } from 'react';
import './App.css';
import { Explorer, Toaster } from '../src/index';

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <div
        style={{
          minHeight: '40vh',
          height: '40vh',
        }}
        className="min-h-[30vh] w-full"
      >
        <Explorer
          className="h-full"
          useShadowDOM
          darkMode={false}
          apiURI={'http://localhost:8888'}
          websocketURI={'ws://localhost:8888/runtime/session'}
          // @ts-expect-error
          appId={import.meta.env.VITE_INSTANT_APP_ID}
          // @ts-expect-error
          adminToken={import.meta.env.VITE_INSTANT_ADMIN_TOKEN}
        />
      </div>
      <div
        style={{
          minHeight: '40vh',
          height: '40vh',
        }}
        className="dark min-h-[30vh] w-full"
      >
        <Explorer
          className="h-full"
          useShadowDOM
          darkMode={true}
          apiURI={'http://localhost:8888'}
          websocketURI={'ws://localhost:8888/runtime/session'}
          // @ts-expect-error
          appId={import.meta.env.VITE_INSTANT_APP_ID}
          // @ts-expect-error
          adminToken={import.meta.env.VITE_INSTANT_ADMIN_TOKEN}
        />
      </div>
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
      <Toaster position="top-right" />
    </>
  );
}

export default App;
