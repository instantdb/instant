'use client';

import {
  i,
  init,
  tx,
  InstantReactAbstractDatabase,
  id,
  SyncTableCallbackEventType,
  type SyncTableCallbackEvent,
  type ValidQuery,
} from '@instantdb/react';
import React, { useEffect, useRef, useState } from 'react';
import config from '../../config';
import { provisionEphemeralApp } from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    items: i.entity({
      name: i.string().indexed(),
      number: i.number().indexed(),
      createdAt: i.date().indexed(),
    }),
    otherTable: i.entity({}),
  },
  links: {
    itemTable: {
      forward: { on: 'items', has: 'one', label: 'other' },
      reverse: { on: 'otherTable', has: 'one', label: 'item' },
    },
  },
});

const adjectives = [
  'Agile',
  'Bright',
  'Clever',
  'Daring',
  'Eager',
  'Fancy',
  'Gentle',
  'Happy',
  'Inventive',
  'Jolly',
  'Kind',
  'Lively',
  'Merry',
  'Noble',
  'Optimistic',
  'Proud',
  'Quick',
  'Radiant',
  'Swift',
  'Thoughtful',
  'Upbeat',
  'Vibrant',
  'Wise',
  'Xenial',
  'Youthful',
  'Zesty',
];

const nouns = [
  'Ant',
  'Bear',
  'Cat',
  'Dolphin',
  'Eagle',
  'Falcon',
  'Giraffe',
  'Hawk',
  'Iguana',
  'Jaguar',
  'Koala',
  'Lion',
  'Moose',
  'Newt',
  'Owl',
  'Panda',
  'Quail',
  'Raven',
  'Shark',
  'Tiger',
  'Urchin',
  'Vulture',
  'Wolf',
  'Xerus',
  'Yak',
  'Zebra',
  'Phoenix',
];

let adjectiveIndex = Math.floor(Math.random() * adjectives.length);
let nounIndex = Math.floor(Math.random() * nouns.length);
let numberCounter = Math.floor(Math.random() * 1000);

function generateRandomName(): string {
  const adjective = adjectives[adjectiveIndex];
  const noun = nouns[nounIndex];
  const number = numberCounter;

  adjectiveIndex = (adjectiveIndex + 1) % adjectives.length;
  nounIndex = (nounIndex + 1) % nouns.length;
  numberCounter = (numberCounter + 1) % 1000;

  return `${adjective} ${noun} ${number}`;
}

type ItemsQuery = { items: {} };

function assertNever(x: never): never {
  throw new Error('Unexpected value: ' + x);
}

function notifyEvent(
  event: SyncTableCallbackEvent<typeof schema, ItemsQuery, false>,
  addMessage: (msg: string) => void,
) {
  switch (event.type) {
    case SyncTableCallbackEventType.InitialSyncBatch:
      addMessage(`Loaded initial batch of ${event.batch.length} new items.`);
      break;
    case SyncTableCallbackEventType.InitialSyncComplete:
      addMessage(`Initial sync complete.`);
      break;
    case SyncTableCallbackEventType.LoadFromStorage:
      addMessage(`Loaded ${event.data.items.length} items from storage.`);
      break;
    case SyncTableCallbackEventType.SyncTransaction: {
      if (event.added.length > 10) {
        addMessage(`Added ${event.added.length} items`);
      } else {
        for (const item of event.added) {
          addMessage(`Added ${item.name}`);
        }
      }
      if (event.removed.length > 10) {
        addMessage(`Removed ${event.removed.length} items`);
      } else {
        for (const item of event.removed) {
          addMessage(`Removed ${item.name}`);
        }
      }

      if (event.updated.length > 10) {
        addMessage(`Updated ${event.removed.length} items`);
      } else {
        for (const updated of event.updated) {
          let desc = '';
          for (const [k, { oldValue, newValue }] of Object.entries(
            updated.changedFields,
          )) {
            desc += ` ${k} from ${oldValue} to ${newValue}`;
          }
          addMessage(`Updated${desc}`);
        }
      }

      break;
    }
    case SyncTableCallbackEventType.Error: {
      console.log('error', event.error);
      addMessage(`Error: ${event.error.message}`);
      break;
    }
    default:
      assertNever(event);
  }
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
  const [orderByField, setOrderByField] = useState<
    'serverCreatedAt' | 'name' | 'number' | 'createdAt'
  >('serverCreatedAt');
  const [orderByDirection, setOrderByDirection] = useState<'asc' | 'desc'>(
    'desc',
  );
  const [messages, setMessages] = useState<
    Array<{ text: string; count: number; timestamp: number }>
  >([]);

  const handleCreateItem = () => {
    db.transact([
      tx.items[id()].update({
        name: generateRandomName(),
        number: Math.random(),
        createdAt: new Date(),
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
            number: Math.random(),
            createdAt: new Date(),
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
            number: Math.random(),
            createdAt: new Date(),
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

  const unsubRef = useRef<
    | null
    | (() => void)
    | ((
        opts?:
          | { keepSubscription?: boolean | null | undefined }
          | null
          | undefined,
      ) => void)
  >(null);

  const [i, setI] = useState(0);

  const addMessage = (text: string) => {
    setMessages((prev) => {
      const lastMsg = prev[0];
      if (lastMsg && lastMsg.text === text) {
        // Same message, increment count
        return [
          { ...lastMsg, count: lastMsg.count + 1, timestamp: Date.now() },
          ...prev.slice(1),
        ];
      } else {
        // New message, add to front and keep only last 1000
        return [{ text, count: 1, timestamp: Date.now() }, ...prev].slice(
          0,
          1000,
        );
      }
    });
  };

  useEffect(() => {
    if (useSubscribeQuery) {
      const unsub = db.core.subscribeQuery(
        {
          items: {
            $: { order: { [orderByField]: orderByDirection } },
          },
        },
        (res) => {
          if (res.data) {
            setEntities(res.data.items);
          }
        },
      );

      unsubRef.current = unsub;
    } else {
      const unsub = db.core._syncTableExperimental(
        {
          items: {
            $: { order: { [orderByField]: orderByDirection } },
          },
        },
        (event) => {
          notifyEvent(event, addMessage);
          setEntities(event.data.items);
        },
      );
      unsubRef.current = unsub;
      return () => unsub({ keepSubscription: true });
    }
  }, [i, useSubscribeQuery, orderByField, orderByDirection]);

  const triggerError = () => {
    let unsub: undefined | ((opts?: any) => void);
    unsub = db.core._syncTableExperimental(
      // @ts-ignore: invalid query test
      {
        items: {},
        extraField: {},
      },
      (event: any) => {
        notifyEvent(event, addMessage);
        unsub && unsub();
      },
    );
    let unsub2: undefined | ((opts?: any) => void);
    unsub2 = db.core._syncTableExperimental(
      {
        items: {
          other: {},
        },
      },
      (event: any) => {
        notifyEvent(event, addMessage);
        unsub2 && unsub2();
      },
    );
    let unsub3: undefined | ((opts?: any) => void);
    unsub3 = db.core._syncTableExperimental(
      {
        items: {
          $: { order: { name: 'desc' }, where: { name: 'Test' } },
        },
      },
      (event: any) => {
        notifyEvent(event, addMessage);
        unsub3 && unsub3();
      },
    );
  };

  return (
    <div className="min-h-screen">
      <div className="flex justify-center gap-8 p-4">
        <div className="min-w-[560px]">
          <div className="mb-4">
            <h1 className="mb-4 text-4xl font-bold text-gray-800">
              Items ({entities.length})
            </h1>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    Mode:
                  </span>
                  <select
                    value={
                      useSubscribeQuery ? 'subscribeQuery' : 'subscribeTable'
                    }
                    onChange={(e) => {
                      if (unsubRef.current) {
                        unsubRef.current();
                        setEntities([]);
                      }
                      setUseSubscribeQuery(e.target.value === 'subscribeQuery');
                    }}
                    className="cursor-pointer border-0 bg-transparent pr-6 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="subscribeTable">subscribeTable</option>
                    <option value="subscribeQuery">subscribeQuery</option>
                  </select>
                </div>
                <div className="h-5 w-px bg-gray-300"></div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    Sort:
                  </span>
                  <select
                    value={orderByField}
                    onChange={(e) =>
                      setOrderByField(
                        e.target.value as
                          | 'serverCreatedAt'
                          | 'name'
                          | 'number'
                          | 'createdAt',
                      )
                    }
                    className="cursor-pointer border-0 bg-transparent pr-6 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="serverCreatedAt">Server Created</option>
                    <option value="name">Name</option>
                    <option value="number">Number</option>
                    <option value="createdAt">Created</option>
                  </select>
                  <button
                    onClick={() =>
                      setOrderByDirection(
                        orderByDirection === 'asc' ? 'desc' : 'asc',
                      )
                    }
                    className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {orderByDirection === 'asc' ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 15l7-7 7 7"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M19 9l-7 7-7-7"
                        />
                      )}
                    </svg>
                    <span>{orderByDirection === 'asc' ? 'Asc' : 'Desc'}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCreateItem}
                  disabled={isCreating}
                  className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create Item
                </button>
                <button
                  onClick={handleCreate1000Items}
                  disabled={isCreating}
                  className="whitespace-nowrap rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create 1000
                </button>
                <button
                  onClick={handleCreate10kItems}
                  disabled={isCreating}
                  className="whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create 10k
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    if (unsubRef.current) {
                      unsubRef.current({ keepSubscription: false });
                      setEntities([]);
                    }
                  }}
                  disabled={useSubscribeQuery}
                  className="whitespace-nowrap rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hard Unsubscribe
                </button>
                <button
                  onClick={() => {
                    if (unsubRef.current) {
                      unsubRef.current({ keepSubscription: true });
                    }
                  }}
                  disabled={useSubscribeQuery}
                  className="whitespace-nowrap rounded-lg bg-gray-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Soft Unsubscribe
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
                  className="whitespace-nowrap rounded-lg bg-gray-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset Subscription
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={onResetApp}
                  disabled={isCreating}
                  className="whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset App
                </button>
                <button
                  onClick={triggerError}
                  className="whitespace-nowrap rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  Try an invalid query
                </button>
              </div>
            </div>
            {isCreating && (
              <div className="mt-4 flex items-center gap-3 text-gray-700">
                <svg
                  className="h-5 w-5 animate-spin"
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
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-4">
            <h2 className="mb-4 text-2xl font-bold text-gray-800">Events</h2>
            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              {messages.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  No events yet
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {messages.map((msg, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <p className="text-sm text-gray-900">
                        {msg.text}
                        {msg.count > 1 && (
                          <span className="ml-2 text-xs font-semibold text-gray-600">
                            (x{msg.count})
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getColorForItem(item: { name: string }): { bg: string; text: string } {
  const colors = [
    { bg: 'bg-amber-100', text: 'text-amber-600' },
    { bg: 'bg-blue-100', text: 'text-blue-600' },
    { bg: 'bg-cyan-100', text: 'text-cyan-600' },
    { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' },
    { bg: 'bg-green-100', text: 'text-green-600' },
    { bg: 'bg-indigo-100', text: 'text-indigo-600' },
    { bg: 'bg-lime-100', text: 'text-lime-600' },
    { bg: 'bg-orange-100', text: 'text-orange-600' },
    { bg: 'bg-pink-100', text: 'text-pink-600' },
    { bg: 'bg-purple-100', text: 'text-purple-600' },
    { bg: 'bg-red-100', text: 'text-red-600' },
    { bg: 'bg-rose-100', text: 'text-rose-600' },
    { bg: 'bg-sky-100', text: 'text-sky-600' },
    { bg: 'bg-slate-100', text: 'text-slate-600' },
    { bg: 'bg-teal-100', text: 'text-teal-600' },
    { bg: 'bg-violet-100', text: 'text-violet-600' },
    { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    { bg: 'bg-zinc-100', text: 'text-zinc-600' },
    { bg: 'bg-stone-100', text: 'text-stone-600' },
    { bg: 'bg-gray-100', text: 'text-gray-600' },
    { bg: 'bg-neutral-100', text: 'text-neutral-600' },
    { bg: 'bg-blue-200', text: 'text-blue-700' },
    { bg: 'bg-green-200', text: 'text-green-700' },
    { bg: 'bg-purple-200', text: 'text-purple-700' },
    { bg: 'bg-red-200', text: 'text-red-700' },
  ];

  // Use the first few characters of the id to generate a consistent color
  const hash = item.name.charCodeAt(0);
  return colors[hash % colors.length];
}

function Items({
  items,
  db,
}: {
  items: { id: string; name: string }[];
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
        const color = getColorForItem(item);
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
      <div className="mx-auto flex max-w-lg flex-col">
        <Main db={db} onResetApp={handleResetApp} appId={app.id} />
      </div>
    );
  }
  return <div className="mx-auto flex max-w-lg flex-col">Loading...</div>;
}

export default App;
