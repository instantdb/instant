import { i, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import { useState } from 'react';

const schema = i.schema({
  entities: {},
  rooms: {
    chat: {
      presence: i.entity({ name: i.string() }),
    },
    video: {
      presence: i.entity({ name: i.string() }),
    },
  },
});

const perms = {
  $rooms: {
    chat: {
      allow: {
        join: 'auth.id != null',
      },
    },
    $default: {
      allow: {
        join: 'false',
      },
    },
  },
};

type DB = InstantReactAbstractDatabase<typeof schema>;

function ChatRoomTest({ db }: { db: DB }) {
  const room = db.room('chat', 'test-room');
  const presence = db.rooms.usePresence(room, {
    initialPresence: { name: 'guest' },
  });

  return (
    <div className="rounded border p-2">
      <p className="text-sm font-medium">chat room (should succeed)</p>
      {presence.isLoading ? (
        <p className="text-sm text-yellow-600">Joining...</p>
      ) : presence.error ? (
        <p className="text-sm text-red-600">
          Error: {presence.error.message || JSON.stringify(presence.error)}
        </p>
      ) : (
        <p className="text-sm text-green-600">Connected!</p>
      )}
    </div>
  );
}

function VideoRoomTest({ db }: { db: DB }) {
  const room = db.room('video', 'test-room-video');
  const presence = db.rooms.usePresence(room, {
    initialPresence: { name: 'guest' },
  });

  return (
    <div className="rounded border p-2">
      <p className="text-sm font-medium">video room (should fail - $default)</p>
      {presence.isLoading ? (
        <p className="text-sm text-yellow-600">Joining...</p>
      ) : presence.error ? (
        <p className="text-sm text-red-600">
          Error: {presence.error.message || JSON.stringify(presence.error)}
        </p>
      ) : (
        <p className="text-sm text-green-600">Connected!</p>
      )}
    </div>
  );
}

function App({ db, appId }: { db: DB; appId: string }) {
  const { isLoading: authLoading, user } = db.useAuth();
  const [showChat, setShowChat] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-bold">Room Permissions Test</h1>
      <p className="text-sm text-gray-600">
        chat = <code>auth.id != null</code>, $default = <code>false</code>
      </p>

      <div className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">1. Auth</h2>
        {authLoading ? (
          <p>Loading...</p>
        ) : user ? (
          <div>
            <p className="text-green-600">Signed in: {user.email || user.id}</p>
            <button
              className="mt-1 rounded bg-gray-200 px-2 py-1 text-sm"
              onClick={() => db.auth.signOut()}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            className="rounded bg-blue-500 px-3 py-1 text-white"
            onClick={() => db.auth.signInAsGuest()}
          >
            Sign In as Guest
          </button>
        )}
      </div>

      {user && (
        <div className="space-y-2 rounded border p-3">
          <h2 className="font-semibold">2. Join Rooms</h2>
          <div className="space-y-2">
            <button
              className="rounded bg-green-500 px-3 py-1 text-white"
              onClick={() => setShowChat(true)}
            >
              Join "chat" Room
            </button>
            {showChat && <ChatRoomTest db={db} />}

            <button
              className="rounded bg-red-500 px-3 py-1 text-white"
              onClick={() => setShowVideo(true)}
            >
              Join "video" Room
            </button>
            {showVideo && <VideoRoomTest db={db} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <div>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </div>
  );
}
