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

function addDocWithRuleParamAndLookup() {
  const key = `${randInt(10000, 99999)}`;
  return db.transact(
    tx.playDocs[lookup('key', key)].ruleParams({ test: 'foo' }).update({
      title: 'doc ' + key,
      secret: secrets[randInt(0, 2)],
    }),
  );
}

function update(doc: any) {
  const { id, secret } = doc;
  const key = `${randInt(10000, 99999)}`;
  return db.transact(
    db.tx.playDocs[id].ruleParams({ secret }).update({
      title: 'doc ' + key,
      key,
    }),
  );
}

async function deleteAll(secret: string) {
  const resp = await db.queryOnce({ playDocs: {} }, { ruleParams: { secret } });
  return db.transact(
    resp.data.playDocs.map((doc) =>
      db.tx.playDocs[doc.id].ruleParams({ secret }).delete(),
    ),
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
    <ul className="list-disk pl-4">
      {q.data.playDocs.map((doc) => {
        return (
          <li className="list-disk">
            '{doc.title}', secret: '{doc.secret}', key: '{doc.key}'
            <button
              onClick={() => {
                update(doc);
              }}
              className="m-1 rounded bg-blue-500 p-2 text-white"
            >
              Update
            </button>
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
        { label: 'Add Doc', fn: addDoc },
        { label: 'Add Doc with ruleParams', fn: addDocWithRuleParam },
        {
          label: 'Add Doc with ruleParams and lookup',
          fn: addDocWithRuleParamAndLookup,
        },
      ].map(({ label, fn }) => {
        return (
          <button
            key={label}
            onClick={fn}
            className="m-1 rounded bg-blue-500 p-2 text-white"
          >
            {label}
          </button>
        );
      })}

      {secrets.map((secret) => {
        return (
          <>
            <div>
              Docs for {secret}:
              <button
                onClick={() => {
                  deleteAll(secret);
                }}
                className="m-1 rounded bg-blue-500 p-2 text-white"
              >
                Delete All
              </button>
            </div>
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
      create: 'ruleParams.test == "foo"',
      update: 'ruleParams.test == "foo"',
      delete: 'data.secret == ruleParams.secret',
    },
  },
};
