import { i, id, InstantReactAbstractDatabase, tx } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    docs: i.entity({
      title: i.string(),
    }),
  },
});

const perms = {
  docs: {
    allow: {
      view: 'true',
    },
  },
};

function App({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const { isLoading, error, data } = db.useQuery({ docs: {} });

  if (isLoading) {
    return <div>Loading</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <ResetButton className="m-2 bg-black p-2 text-white" />
      <pre>{JSON.stringify(data, null, 2)}</pre>;
      <button
        className="m-2 bg-black p-2 text-white"
        onClick={() =>
          db.transact(db.tx.docs[id()].update({ title: 'New doc' }))
        }
      >
        Add doc
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto mt-20 flex max-w-lg flex-col">
      <div>
        This is a demo of how to create a play page with an ephemeral app. Look
        at `ephemeral-demo.tsx` to create your own.
      </div>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </div>
  );
}
