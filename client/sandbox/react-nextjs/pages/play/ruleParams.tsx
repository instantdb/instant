import { i, id, init, tx } from '@instantdb/react';
import { useEffect } from 'react';
import config from '../../config';

const schema = i.schema({
  entities: {
    playDocs: i.entity({
      title: i.string(),
      secret: i.string(),
    }),
  },
});

const db = init({ ...config, schema });

const secrets = ['one', 'two', 'three'];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDoc() {
  return db.transact(
    tx.playDocs[id()].update({
      title: 'doc ' + randInt(10000, 99999),
      secret: secrets[randInt(0, 2)],
    }),
  );
}

function DocList({ q }: { q: any }) {
  if (q.isLoading) {
    return <div>Loading...</div>;
  }

  if (q.error) {
    return <div>Error: {q.error.message}</div>;
  }

  return (
    <ul className="pl-4 list-disk">
      {q.data.playDocs.map((doc: any) => {
        return (
          <li className="list-disk">
            '{doc.title}', secret: '{doc.secret}'
          </li>
        );
      })}
    </ul>
  );
}

function Main() {
  const queries = secrets.map((secret) => [
    secret,
    db.useQuery({ playDocs: {} }, { ruleParams: { secret } }),
  ]);

  return (
    <div className="p-1">
      <button
        className="px-4 py-2 bg-slate-500 text-white rounded"
        onClick={addDoc}
      >
        New doc
      </button>
      {queries.map(([secret, q]) => {
        return (
          <>
            <div>Docs for {secret as string}:</div>
            <DocList q={q} />
          </>
        );
      })}
    </div>
  );
}

function App() {
  return <Main />;
}

export default App;

// copy this to dashboard
const rules = {
  playDocs: {
    allow: {
      view: 'ruleParams.secret == data.secret',
    },
  },
};
