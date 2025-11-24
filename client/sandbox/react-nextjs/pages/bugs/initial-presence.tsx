import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState, useEffect } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {},
  rooms: {
    chat: {
      presence: i.entity({
        displayName: i.string(),
      }),
    },
  },
});

type Schema = typeof schema;

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function Presence({
  db,
  name,
  setJoin,
}: {
  db: InstantReactAbstractDatabase<Schema>;
  name: string;
  setJoin: (join: boolean) => void;
}) {
  const room = db.room('chat');
  const { user } = db.rooms.usePresence(room, {
    initialPresence: { displayName: name },
  });
  return (
    <div className="flex flex-col space-y-6">
      <p>You are: {user?.displayName}</p>
      <button
        onClick={() => setJoin(false)}
        className="mt-4 bg-blue-500 p-2 text-white"
      >
        Leave Chat Room
      </button>
      <ResetButton className="mb-4 rounded bg-red-500 px-4 py-2 text-white" />
    </div>
  );
}

function App({ db }: AppProps) {
  const [name, setName] = useState('');
  const [join, setJoin] = useState(false);
  const room = db.room('chat');
  if (join) {
    return <Presence db={db} name={name} setJoin={setJoin} />;
  }

  return (
    <div className="flex flex-col items-center">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your display name"
        className="mb-4 w-full border p-2"
      />
      <button
        onClick={() => setJoin(true)}
        className="mb-4 w-full bg-blue-500 p-2 text-white"
      >
        Join Chat Room
      </button>
      <ResetButton className="mb-4 rounded bg-red-500 px-4 py-2 text-white" />
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto mt-20 flex max-w-lg flex-col">
      <h1 className="mb-4 text-center text-2xl font-bold">
        Initial Presence Example
      </h1>
      <p className="mb-8 text-center text-gray-600">
        Enter your display name and join the chat room. Your presence will be
        set when you join.
      </p>
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
