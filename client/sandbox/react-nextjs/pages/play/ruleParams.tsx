import { i, id, init, InstaQLEntity, lookup, tx } from '@instantdb/react';
import config from '../../config';

const schema = i.schema({
  entities: {
    playDocs: i.entity({
      title: i.string(),
      secret: i.string(),
      key: i.string().unique(),
    }),
  },
});

type PlayDoc = InstaQLEntity<typeof schema, 'playDocs'>;

const db = init({ ...config, schema });

const secrets = ['one', 'two', 'three'];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDoc() {
  const key = `${randInt(10000, 99999)}`;
  return db.transact(
    tx.playDocs[id()].update({
      title: 'doc ' + key,
      secret: secrets[randInt(0, 2)],
      key,
    }),
  );
}

function addDocWithRuleParam() {
  const key = `${randInt(10000, 99999)}`;
  return db.transact(
    tx.playDocs[id()].ruleParams({ test: 'foo' }).update({
      title: 'doc ' + key,
      secret: secrets[randInt(0, 2)],
      key,
    }),
  );
}

function addDocRuleParamAndLookupRef() {
  const key = `${randInt(10000, 99999)}`;
  return db.transact(
    tx.playDocs[lookup('key', key)].ruleParams({ test: 'foo' }).update({
      title: 'doc ' + key,
      secret: secrets[randInt(0, 2)],
    }),
  );
}

function DocList({ secret }: { secret: string }) {
  const q = db.useQuery({ playDocs: {} }, { ruleParams: { secret } });

  if (q.isLoading) {
    return <div>Loading...</div>;
  }

  if (q.error) {
    return <div>Error: {q.error.message}</div>;
  }

  return (
    <ul className="pl-4 list-disk">
      {q.data.playDocs.map((doc) => {
        return (
          <li className="list-disk">
            '{doc.title}', secret: '{doc.secret}', key: '{doc.key}'
          </li>
        );
      })}
    </ul>
  );
}

function Main() {
  return (
    <div className="p-1">
      {[
        { label: 'addDoc', fn: addDoc },
        { label: 'addDocWithRuleParam', fn: addDocWithRuleParam },
        {
          label: 'addDocRuleParamAndLookupRef',
          fn: addDocRuleParamAndLookupRef,
        },
      ].map(({ label, fn }) => {
        return (
          <button
            key={label}
            onClick={fn}
            className="p-2 m-1 bg-blue-500 text-white rounded"
          >
            {label}
          </button>
        );
      })}

      {secrets.map((secret) => {
        return (
          <>
            <div>Docs for {secret}:</div>
            <DocList secret={secret} />
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
