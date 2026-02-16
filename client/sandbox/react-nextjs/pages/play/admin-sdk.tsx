import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { useEffect, useRef, useState } from 'react';
import {
  i,
  init,
  id,
  SubscribeQueryPayload,
  SubscribeQueryResponse,
  ValidQuery,
} from '@instantdb/admin';
import config from '../../config';

let j = 0;
const testId = id();

const schema = i.schema({
  entities: {
    test: i.entity({
      i: i.number().indexed(),
    }),
    owner: i.entity({
      name: i.string(),
    }),
  },
  links: {
    testOwner: {
      forward: {
        on: 'test',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: 'owner',
        has: 'many',
        label: 'tests',
      },
    },
  },
});

async function asyncIterate(sub: any) {
  console.log('async iterate');
  for await (const res of sub) {
    console.log('got an async iterator res!', res);
  }
  console.log('async iterate is done!');
}

function App({ app }: { app: { id: string; 'admin-token': string } }) {
  const db = useRef(
    init({
      ...config,
      appId: app.id,
      adminToken: app['admin-token'],
      schema,
      verbose: true,
    }),
  );
  const q = {
    test: { $: { limit: 5, order: { i: 'desc' } }, owner: {} },
  } as const;
  const [payloads, setPayloads] = useState<
    SubscribeQueryPayload<
      typeof schema,
      ValidQuery<typeof q, typeof schema>,
      any
    >[]
  >([]);
  const [sub, setSub] = useState<SubscribeQueryResponse<any, any, any> | null>(
    null,
  );

  const [triggerSub, setTriggerSub] = useState(0);

  useEffect(() => {
    const sub = db.current.subscribeQuery(q, (m) => {
      if (m.type === 'error') {
        setPayloads((ps) => [m, ...ps]);
      } else if (m.type === 'ok') {
        setPayloads((ps) => [m, ...ps]);
      }
    });
    // @ts-ignore
    globalThis.sub = sub;
    setSub(sub);
    asyncIterate(sub);
    return sub.close;
  }, [triggerSub]);

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
          className="m-2 bg-black p-2 text-white"
          onClick={() => {
            db.current.transact(db.current.tx.test[testId].update({ i: j++ }));
          }}
        >
          Change data
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => {
            db.current.transact(db.current.tx.test[id()].update({ i: j++ }));
          }}
        >
          Push item
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => {
            const ownerId = id();
            const testItemId = id();
            db.current.transact([
              db.current.tx.owner[ownerId].update({ name: `Owner ${j}` }),
              db.current.tx.test[testItemId]
                .update({ i: j++ })
                .link({ owner: ownerId }),
            ]);
          }}
        >
          Push item with owner
        </button>
        {sub ? (
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              sub?.close();
              setSub(null);
            }}
          >
            Close subscription
          </button>
        ) : (
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              setTriggerSub((x) => x + 1);
            }}
          >
            Recreate subscription
          </button>
        )}
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
    provisionEphemeralApp({ schema, useDateObjects: false })
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
      <div className="mx-auto mt-20 flex max-w-lg flex-col">
        <App app={app} />
      </div>
    );
  }
  return <div className="mx-auto mt-20 flex max-w-lg flex-col">Loading...</div>;
}
