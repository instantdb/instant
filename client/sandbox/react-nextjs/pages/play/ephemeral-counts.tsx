import React, { useEffect, useRef } from 'react';
import Head from 'next/head';
import { init, Cursors } from '@instantdb/react';
import config from '../../config';

const db = init(config);
const room = db.room('main', '123');

function App() {
  const interval = useRef<NodeJS.Timer | null>(null);
  const { peers, user, publishPresence } = db.rooms.usePresence(room);
  const sendUpdates = () => {
    if (interval.current) clearInterval(interval.current);
    let n = 0;
    interval.current = setInterval(() => {
      n++;
      publishPresence({ count: { n } });
    }, 1000);
  };
  return (
    <div>
      <button className="bg-black text-white" onClick={sendUpdates}>
        Send Updates
      </button>
      <pre>Me: {JSON.stringify(user, null, 2)}</pre>
      <pre>Peers: {JSON.stringify(Object.values(peers), null, 2)}</pre>
      <div className="space-y-2">
        <div>Open up two tabs. Click "send update" on one tab.</div>
        <div>
          <strong>
            Make sure that the updates show up. They may not show up if Reactor
            mutates `peers`.
          </strong>
        </div>
      </div>
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Cursors Counts</title>
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
