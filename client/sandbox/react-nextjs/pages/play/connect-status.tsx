import { init, ConnectionStatus } from '@instantdb/react';
import config from '../../config';

const db = init(config);

function App() {
  return <Main />;
}

function Main() {
  const status: ConnectionStatus = db.useConnectionStatus();
  return (
    <div>
      <div className="p-2">
        <pre className="whitespace-pre-wrap mb-4 w-1/3">
          <div>Instructions:</div>
          <div>
            1. Set Chrome network to "Slow 3G" in DevTools (Network tab)
          </div>
          <div>2. Press "Restart" and watch the connection status change:</div>
          <div> **closed** to **open to **authenticated**</div>
          <div>
            3. Press "Shutdown" and observe the connection remain **closed**
          </div>
        </pre>
        <div className="flex space-x-2">
          <p>Connection Status:</p>
          <p>{status}</p>
        </div>
        <div className="space-x-2">
          <button
            className="border border-black p-2"
            onClick={() => db._core._reactor._ws.close()}
          >
            Restart
          </button>
          <button
            className="border border-black p-2"
            onClick={() => db._core.shutdown()}
          >
            Shutdown
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
