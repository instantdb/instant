import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useEffect, useRef, useState } from 'react';
import { init, id } from '@instantdb/admin';
import config from '../../config';

let i = 0;
const testId = id();

async function doThing(sub: any) {
  console.log('doing thing');
  for await (const res of sub) {
    console.log('got a res!', res);
  }
}

function App({ app }: { app: { id: string; 'admin-token': string } }) {
  const db = useRef(
    init({ ...config, appId: app.id, adminToken: app['admin-token'] }),
  );
  const [payloads, setPayloads] = useState<any[]>([]);

  useEffect(() => {
    const sub = db.current.subscribeQuery({ test: {} }, (m: any) => {
      console.log('m', m);
      setPayloads((ps) => [m, ...ps]);
    });
    // @ts-ignore
    globalThis.sub = sub;
    doThing(sub);
    () => {
      sub.close();
    };
  }, []);

  // @ts-ignore
  globalThis.db = db.current;
  // @ts-ignore
  globalThis.id = id;

  return (
    <div>
      <div>This uses the admin sdk to subscribe to a query.</div>
      <div>Check window.db for the admin db.</div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            db.current.transact(db.current.tx.test[testId].update({ i: i++ }));
          }}
        >
          Add data
        </button>
      </div>
      <div>Payloads:</div>
      <ul>
        {payloads.map((p, i) => (
          <li key={i}>
            <pre className="text-sm">{JSON.stringify(p, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  const [app, setApp] = useState(null);
  const [error, setError] = useState<null | Error>(null);
  useEffect(() => {
    provisionEphemeralApp({})
      .then((res) => setApp(res.app))
      .catch((e) => {
        console.error('Error creating app', e);
        setError(e);
      });
  }, []);

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (app) {
    return (
      <div className="max-w-lg flex flex-col mt-20 mx-auto">
        <App app={app} />
      </div>
    );
  }
  return <div className="max-w-lg flex flex-col mt-20 mx-auto">Loading...</div>;
}
