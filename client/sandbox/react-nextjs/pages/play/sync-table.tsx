'use client';

import {
  i,
  init,
  tx,
  InstantReactAbstractDatabase,
  id,
} from '@instantdb/react';
import React, { useEffect, useRef, useState } from 'react';
import config from '../../config';
import { provisionEphemeralApp } from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    items: i.entity({
      name: i.string(),
    }),
  },
});

function generateRandomName(): string {
  const adjectives = [
    'Happy',
    'Clever',
    'Bright',
    'Swift',
    'Bold',
    'Calm',
    'Eager',
    'Fancy',
    'Gentle',
    'Jolly',
    'Kind',
    'Lively',
    'Merry',
    'Noble',
    'Proud',
    'Quick',
    'Wise',
    'Zesty',
  ];

  const nouns = [
    'Lion',
    'Eagle',
    'Tiger',
    'Dolphin',
    'Falcon',
    'Wolf',
    'Bear',
    'Hawk',
    'Fox',
    'Owl',
    'Panda',
    'Dragon',
    'Phoenix',
    'Raven',
    'Cobra',
    'Shark',
    'Jaguar',
    'Leopard',
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);

  return `${adjective} ${noun} ${number}`;
}

function Main({
  db,
  onResetApp,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  onResetApp: () => void;
  appId: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const [useSubscribeQuery, setUseSubscribeQuery] = useState(false);

  const handleCreateItem = () => {
    db.transact([
      tx.items[id()].update({
        name: generateRandomName(),
      }),
    ]);
  };

  const handleCreate1000Items = async () => {
    setIsCreating(true);
    setCreationProgress(0);
    const batchSize = 100;
    const totalBatches = 10; // 1000 / 100 = 10

    for (let batch = 0; batch < totalBatches; batch++) {
      const txs = [];
      for (let i = 0; i < batchSize; i++) {
        txs.push(
          tx.items[id()].update({
            name: generateRandomName(),
          }),
        );
      }
      await db.transact(txs);
      setCreationProgress(((batch + 1) / totalBatches) * 100);
    }

    setIsCreating(false);
    setCreationProgress(0);
  };

  const handleCreate10kItems = async () => {
    setIsCreating(true);
    setCreationProgress(0);
    const batchSize = 250;
    const totalBatches = 40; // 10000 / 250 = 40

    for (let batch = 0; batch < totalBatches; batch++) {
      const txs = [];
      for (let i = 0; i < batchSize; i++) {
        txs.push(
          tx.items[id()].update({
            name: generateRandomName(),
          }),
        );
      }
      await db.transact(txs);
      setCreationProgress(((batch + 1) / totalBatches) * 100);
    }

    setIsCreating(false);
    setCreationProgress(0);
  };

  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>(
    [],
  );

  const unsubRef = useRef<null | (() => void)>(null);

  const [i, setI] = useState(0);

  useEffect(() => {
    if (useSubscribeQuery) {
      const unsub = db.core.subscribeQuery({ items: {} }, (res) => {
        if (res.data) {
          setEntities(res.data.items.toReversed());
        }
      });

      unsubRef.current = unsub;
    } else {
      const unsub = db.core._reactor.subscribeTable(
        {
          items: {},
        },
        (ents: any) => {
          if (ents.length === 31024) {
          }
          setEntities(ents.toReversed());
        },
      );
      unsubRef.current = unsub;
    }
  }, [i, useSubscribeQuery]);

  return (
    <div className="min-h-screen">
      <div className="fixed top-4 right-4 text-sm text-gray-600 z-10">
        <span className="font-mono">{appId}</span>
      </div>
      <div className="w-full max-w-4xl mx-auto p-4">
        <div className="mb-4">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Items ({entities.length})
          </h1>
          <div className="flex gap-3 flex-wrap items-center">
            <button
              onClick={() => {
                if (unsubRef.current) {
                  unsubRef.current();
                  setEntities([]);
                }
                setUseSubscribeQuery(!useSubscribeQuery);
              }}
              className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-teal-700 whitespace-nowrap"
            >
              Mode: {useSubscribeQuery ? 'subscribeQuery' : 'subscribeTable'}
            </button>
            <button
              onClick={handleCreateItem}
              disabled={isCreating}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Item
            </button>
            <button
              onClick={handleCreate1000Items}
              disabled={isCreating}
              className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-purple-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create 1000
            </button>
            <button
              onClick={handleCreate10kItems}
              disabled={isCreating}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create 10k
            </button>
            <button
              onClick={() => {
                if (unsubRef.current) {
                  unsubRef.current();
                  setEntities([]);
                  setI((i) => i + 1);
                }
              }}
              disabled={isCreating}
              className="rounded-lg bg-gray-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Subscription
            </button>
            <button
              onClick={onResetApp}
              disabled={isCreating}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset App
            </button>
          </div>
          {isCreating && (
            <div className="mt-4 flex items-center gap-3 text-gray-700">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span>Creating items... {Math.round(creationProgress)}%</span>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <Items items={entities.slice(0, 100)} db={db} />
        </div>
      </div>
    </div>
  );
}

function getColorForItem(id: string): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-blue-100', text: 'text-blue-600' },
    { bg: 'bg-purple-100', text: 'text-purple-600' },
    { bg: 'bg-pink-100', text: 'text-pink-600' },
    { bg: 'bg-green-100', text: 'text-green-600' },
    { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    { bg: 'bg-red-100', text: 'text-red-600' },
    { bg: 'bg-indigo-100', text: 'text-indigo-600' },
    { bg: 'bg-orange-100', text: 'text-orange-600' },
    { bg: 'bg-teal-100', text: 'text-teal-600' },
    { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  ];

  // Use the first few characters of the id to generate a consistent color
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function Items({
  items,
  db,
}: {
  items: { id: string; name?: string }[];
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-gray-500">
        No items yet. Create one to get started!
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((item) => {
        const color = getColorForItem(item.id);
        return (
          <div
            key={item.id}
            className="px-6 py-4 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${color.bg} ${color.text}`}
                >
                  <span className="text-sm font-semibold">
                    {item.name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {item.name || 'Untitled'}
                  </p>
                  <p className="text-xs text-gray-500">{item.id}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    db.transact(
                      db.tx.items[item.id].update({
                        name: generateRandomName(),
                      }),
                    );
                  }}
                  className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200"
                >
                  Update
                </button>
                <button
                  onClick={() => {
                    db.transact(db.tx.items[item.id].delete());
                  }}
                  className="rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-200"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STORAGE_KEY = 'sync-table-ephemeral-app';

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await r.json();

  if (!r.ok) {
    throw data;
  }
  return data;
}

function App() {
  const [app, setApp] = useState<{ id: string; 'admin-token': string } | null>(
    null,
  );
  const [error, setError] = useState<null | Error>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleResetApp = () => {
    if (
      confirm(
        'Are you sure you want to reset the app? This will delete all data and create a new app.',
      )
    ) {
      if (app?.id) {
        const dbName = `instant_${app.id}_5`;
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => {
          console.log(`Deleted IndexedDB database: ${dbName}`);
        };
        deleteRequest.onerror = () => {
          console.error(`Failed to delete IndexedDB database: ${dbName}`);
        };
      }
      localStorage.removeItem(STORAGE_KEY);
      setApp(null);
      setResetKey((k) => k + 1);
    }
  };

  const provisionNewApp = async () => {
    try {
      const res = await provisionEphemeralApp({ schema });
      if (res.app) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res.app));
        setApp(res.app);
      } else {
        setError(new Error('Could not create app'));
      }
    } catch (e) {
      console.error('Error creating app', e);
      setError(e as Error);
    }
  };

  useEffect(() => {
    const savedApp = localStorage.getItem(STORAGE_KEY);

    if (savedApp) {
      try {
        const parsedApp = JSON.parse(savedApp);
        verifyEphemeralApp({ appId: parsedApp.id })
          .then((res) => {
            setApp(parsedApp);
          })
          .catch((err) => {
            if (
              err.type === 'record-not-found' ||
              err.type === 'param-malformed'
            ) {
              console.log('Saved app is invalid, provisioning new one');
              localStorage.removeItem(STORAGE_KEY);
              provisionNewApp();
            } else if (!err.type) {
              // Some other error, maybe offline - trust the saved app
              setApp(parsedApp);
            } else {
              console.error('Error verifying app:', err);
              provisionNewApp();
            }
          });
      } catch (e) {
        console.error('Error parsing saved app:', e);
        localStorage.removeItem(STORAGE_KEY);
        provisionNewApp();
      }
    } else {
      provisionNewApp();
    }
  }, [resetKey]);

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (app) {
    const db = init({
      ...config,
      appId: app.id,
      schema,
      // @ts-ignore
      __adminToken: app['admin-token'],
    });
    return (
      <div className="max-w-lg flex flex-col mx-auto">
        <Main db={db} onResetApp={handleResetApp} appId={app.id} />
      </div>
    );
  }
  return <div className="max-w-lg flex flex-col mx-auto">Loading...</div>;
}

export default App;
