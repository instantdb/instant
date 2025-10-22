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
    initialData: { displayName: name },
  });
  return (
    <div className="flex flex-col space-y-6">
      <p>You are: {user?.displayName}</p>
      <button
        onClick={() => setJoin(false)}
        className="bg-blue-500 text-white p-2 mt-4"
      >
        Leave Chat Room
      </button>
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded mb-4" />
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
        className="border p-2 mb-4 w-full"
      />
      <button
        onClick={() => setJoin(true)}
        className="bg-blue-500 text-white p-2 mb-4 w-full"
      >
        Join Chat Room
      </button>
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded mb-4" />
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">
        Initial Presence Example
      </h1>
      <p className="text-center mb-8 text-gray-600">
        Enter your display name and join the chat room. Your presence will be
        set when you join.
      </p>
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
