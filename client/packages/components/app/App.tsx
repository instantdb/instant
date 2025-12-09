import { useState } from 'react';
import './App.css';
import { Explorer } from '../src/index';

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      {/*Not sure why props aren't autocompleting here*/}
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
          appId="5696faa0-af6b-4562-ade9-47ffb3b2b87b"
          adminToken="59cb9109-0e5c-4735-8775-4369d0486d0b"
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
          appId="5696faa0-af6b-4562-ade9-47ffb3b2b87b"
          adminToken="59cb9109-0e5c-4735-8775-4369d0486d0b"
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
    </>
  );
}

export default App;
