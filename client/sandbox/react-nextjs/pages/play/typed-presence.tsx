import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { i, init, RoomHandle } from '@instantdb/core';
import config from '../../config';

const schema = i.schema({
  entities: {},
  rooms: {
    main: {
      presence: i.entity({
        name: i.string(),
      }),
      topics: {
        testTopic: i.entity({
          test: i.number(),
        }),
      },
    },
  },
});

const db = init({ ...config, schema });

function Presence({ presenceData }: { presenceData: { name: string } }) {
  const [presenceValues, setPresenceValues] = useState<any[]>([]);
  const roomRef = useRef<RoomHandle<any, any> | null>(null);

  useEffect(() => {
    const room = db.joinRoom('main', 'main room id', {
      initialPresence: { name: presenceData.name },
    });
    roomRef.current = room;
    room.subscribePresence({}, (data) => {
      setPresenceValues((current) => [data, ...current]);
    });
    return () => room.leaveRoom();
  }, []);

  const initialData = useRef(presenceData);
  useEffect(() => {
    // Don't publish unless it changes
    if (presenceData !== initialData.current && roomRef.current) {
      roomRef.current.publishPresence({
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
      <p>
        Open two tabs. Join the room in the first tab, then join the room in the
        second tab.
      </p>
      <p>You should see no updates with an empty presence value.</p>
      <input
        type="text"
        value={presenceData}
        placeholder="Set presence value"
        onChange={(e) => setPresenceData(e.target.value)}
      ></input>
      <button
        className="bg-black text-white m-2 p-2"
        onClick={() => setShowPresence(!showPresence)}
      >
        {showPresence ? 'Leave room' : 'Join room'}
      </button>

      {showPresence ? <Presence presenceData={{ name: presenceData }} /> : null}
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
