import type { RoomHandle } from '@instantdb/core';
import { i, InstantReactAbstractDatabase } from '@instantdb/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {},
  rooms: {
    'presence-demo': {
      presence: i.entity({
        stage: i.string(),
      }),
    },
  },
});

type Schema = typeof schema;

const ROOM_TYPE = 'presence-demo';
const ROOM_ID = 'test-room';

function PresenceTracker({ db }: { db: InstantReactAbstractDatabase<Schema> }) {
  const [isJoined, setIsJoined] = useState(false);
  const [updates, setUpdates] = useState<unknown[]>([]);
  const roomRef = useRef<RoomHandle<any, any> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const appendUpdate = useCallback((payload: unknown) => {
    setUpdates((prev) => [payload, ...prev]);
  }, []);

  const joinRoom = useCallback(() => {
    if (isJoined) return;

    setUpdates([]);

    const initialPresence = {
      stage: 'initialPresenceFromJoinRoom',
    };

    console.log('Joining room with initialPresence:', initialPresence);

    // Join room with initialPresence
    const room = db.core.joinRoom(ROOM_TYPE, ROOM_ID, {
      initialPresence,
    });
    roomRef.current = room;

    // Subscribe to presence with initialData
    const subscribeOpts = {
      initialPresence: {
        stage: 'initialPresenceFromSubscribe',
      },
    };

    console.log('Subscribing to presence with:', subscribeOpts);

    unsubscribeRef.current = room.subscribePresence(
      subscribeOpts,
      (response) => {
        console.log('subscribePresence callback invoked:', response);
        appendUpdate(response);
      },
    );
    setIsJoined(true);
  }, [appendUpdate, db, isJoined]);

  const leaveRoom = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    roomRef.current?.leaveRoom();
    roomRef.current = null;
    setIsJoined(false);
  }, []);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      roomRef.current?.leaveRoom();
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <section className="space-y-4">
        <div className="flex gap-2">
          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
            onClick={joinRoom}
            disabled={isJoined}
          >
            Join Room
          </button>
          {isJoined && (
            <button
              className="rounded border border-gray-300 px-4 py-2 text-sm"
              onClick={leaveRoom}
            >
              Leave Room
            </button>
          )}
          <button
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            onClick={() => setUpdates([])}
            disabled={!updates.length}
          >
            Clear Log
          </button>
        </div>

        <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-4 text-sm">
          <div className="font-semibold">Status:</div>
          <div>Room Joined: {isJoined ? '✓ Yes' : '✗ No'}</div>
          <div className="mt-2 font-semibold">
            Total Callbacks: {updates.length}
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div>
              <code className="rounded bg-white px-1 py-0.5">
                initialPresence
              </code>
              : stage = "initialPresenceFromJoinRoom"
            </div>
            <div>
              <code className="rounded bg-white px-1 py-0.5">initialData</code>:
              stage = "initialPresenceFromSubscribe"
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          subscribePresence Updates ({updates.length} total)
        </h2>
        {!isJoined ? (
          <p className="text-sm text-gray-600">
            Click "Join Room", then open this page in other tabs to observe how
            many callback invocations occur per join.
          </p>
        ) : !updates.length ? (
          <p className="text-sm text-gray-600">Waiting for updates...</p>
        ) : (
          <div className="mb-2 text-sm">
            <span className="font-medium">Issue Reproduction:</span>
            <ul className="mt-1 list-inside list-disc space-y-1 text-gray-700">
              <li>
                First user joining should trigger 2 callbacks (expected: 1)
              </li>
              <li>
                Second user joining should trigger 3 callbacks (expected: 1)
              </li>
            </ul>
          </div>
        )}

        <ul className="space-y-3">
          {updates.map((payload, index) => (
            <li
              key={index}
              className="rounded border border-gray-300 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 text-sm font-semibold text-blue-600">
                Update #{updates.length - index}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1 rounded bg-gray-50 p-3 text-xs text-gray-500">
        <div className="font-semibold">Debug Info:</div>
        <div>
          Room Type: <code>{ROOM_TYPE}</code>
        </div>
        <div>
          Room ID: <code>{ROOM_ID}</code>
        </div>
        <div>Using: db.core.joinRoom + room.subscribePresence</div>
      </section>
    </div>
  );
}

function App({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          Initial Presence - Callback Tracking
        </h1>
        <p className="text-sm text-gray-700">
          This demo tracks every <code>subscribePresence</code> callback to
          demonstrate the duplicate invocation issue. Each join should trigger
          exactly 1 callback, but currently triggers multiple.
        </p>
        <p className="text-sm text-gray-600">
          Ephemeral app: <code>{appId}</code>
        </p>
      </div>
      <PresenceTracker db={db} />
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
