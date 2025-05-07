import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { init } from '@instantdb/react';
import config from '../../config';

const db = init(config);

function Presence({ presenceData }: { presenceData: string }) {
  const [presenceValues, setPresenceValues] = useState<any[]>([]);
  useEffect(() => {
    const unsub = db._core._reactor.subscribePresence(
      'main',
      'set-and-join',
      {
        data: { value: presenceData },
      },
      (data: any) => {
        setPresenceValues((current) => [data, ...current]);
      },
    );
    return unsub;
  }, []);

  const initialData = useRef(presenceData);
  useEffect(() => {
    // Don't publish unless it changes
    if (presenceData !== initialData.current) {
      console.log(
        'presenceData',
        presenceData,
        'initialData',
        initialData.current,
      );
      db._core._reactor.publishPresence('main', 'set-and-join', {
        value: presenceData,
      });
    }
  }, [presenceData]);

  return (
    <div>
      <p>All presence updates:</p>
      {presenceValues.map((v, i) => (
        <div key={i}>
          <pre>{JSON.stringify(v, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [showPresence, setShowPresence] = useState(false);
  const [presenceData, setPresenceData] = useState('');
  return (
    <div>
      <button
        className="bg-black text-white m-2 p-2"
        onClick={() => setShowPresence(!showPresence)}
      >
        {showPresence ? 'Leave room' : 'Join room'}
      </button>
      <input
        type="text"
        value={presenceData}
        placeholder="Set presence value"
        onChange={(e) => setPresenceData(e.target.value)}
      ></input>
      {showPresence ? <Presence presenceData={presenceData} /> : null}
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Set presence when you join the room</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <App />
    </div>
  );
}

export default Page;
