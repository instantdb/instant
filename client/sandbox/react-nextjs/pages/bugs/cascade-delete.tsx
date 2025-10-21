import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState, useEffect } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    privateEnts: i.entity({
      email: i.string().optional(),
    }),
    publicEnts: i.entity({
      name: i.string(),
    }),
  },
  links: {
    fullEnt: {
      forward: {
        on: 'publicEnts',
        has: 'one',
        label: 'privateEnts',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'privateEnts',
        has: 'one',
        label: 'publicEnts',
      },
    },
  },
});

type Schema = typeof schema;
interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db }: AppProps) {
  const [deleted, setDeleted] = useState(false);

  const { data, isLoading, error } = db.useQuery({
    publicEnts: {},
    privateEnts: {},
  });

  // Create ents if not present
  useEffect(() => {
    if (data?.privateEnts?.length || isLoading || deleted) return;
    const p1 = id();
    const p2 = id();
    const p3 = id();
    db.transact([
      db.tx.publicEnts[p1].create({ name: 'Bob' }),
      db.tx.publicEnts[p2].create({ name: 'Sally' }),
      db.tx.publicEnts[p3].create({ name: 'Doug' }),
      db.tx.privateEnts[p1]
        .create({ email: 'bob@example.com' })
        .link({ publicEnts: p1 }),
      db.tx.privateEnts[p2]
        .create({ email: 'sally@example.com' })
        .link({ publicEnts: p2 }),
      db.tx.privateEnts[p3]
        .create({ email: 'doug@example.com' })
        .link({ publicEnts: p3 }),
    ]);
  }, [data, isLoading, db]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const { publicEnts, privateEnts } = data;

  const handleDelete = async () => {
    setDeleted(true);
    const txs = privateEnts.map((p) => db.tx.privateEnts[p.id].delete());
    await db.transact(txs);
  };

  return (
    <div className="flex flex-col items-center">
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded mb-4" />
      <div className="flex justify-between">
        <div className="flex flex-col items-center gap-4">
          <h2>Private Ents</h2>
          {privateEnts.map((p) => (
            <div key={p.id}>{p.email}</div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <h2>Public Ents</h2>
          {publicEnts.map((p) => (
            <div key={p.id}>{p.name}</div>
          ))}
        </div>
      </div>
      <button
        onClick={() => handleDelete()}
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
      >
        Delete Private Ents (Cascade Delete Public)
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">
        Cascade Delete Bug
      </h1>
      <p className="text-center mb-8 text-gray-600">
        When you delete entities that have cascade delete, associated entities
        should be deleted as well!
      </p>
      <p className="text-center mb-8 text-gray-600">
        This mostly works, but one bug is when{' '}
        <b>the entities have the same IDs</b> (as in this example), the cascade
        delete does not occur properly.
      </p>
      <p className="text-center mb-8 text-gray-600">
        In this example when we delete all privateEnts, the associated
        publicEnts should also be deleted via cascade delete. But they are not.
      </p>
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
