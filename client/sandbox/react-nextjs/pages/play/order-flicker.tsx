import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { useEffect } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    colors: i.entity({
      order: i.number().indexed(),
      value: i.string(),
    }),
  },
});

type Schema = typeof schema;

const perms = {
  colors: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db }: AppProps) {
  const { data, isLoading } = db.useQuery({
    colors: { $: { order: { order: 'asc' } } },
  });

  // Initialize colors if not present
  useEffect(() => {
    if (data?.colors?.length || isLoading) return;
    db.transact([
      db.tx.colors[id()].update({ order: 0, value: 'red' }),
      db.tx.colors[id()].update({ order: 1, value: 'green' }),
      db.tx.colors[id()].update({ order: 2, value: 'blue' }),
    ]);
  }, [data, isLoading, db]);

  if (!data?.colors) return null;

  return (
    <div className="flex flex-col items-center">
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded mb-4" />
      <div className="flex flex-col items-center gap-4">
        {data.colors.map((c) => (
          <div
            key={c.id}
            className="w-24 h-24 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: c.value }}
          ></div>
        ))}
      </div>
      <button
        onClick={() =>
          db.transact(
            data.colors.map((c, i) =>
              db.tx.colors[c.id].update({
                order: data.colors.length - 1 - i,
              }),
            ),
          )
        }
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
      >
        Reverse Order
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">
        Order Flicker Repro
      </h1>
      <p className="text-center mb-8 text-gray-600">
        Press "Reverse Order" twice to see the flicker effect.
      </p>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </div>
  );
}
