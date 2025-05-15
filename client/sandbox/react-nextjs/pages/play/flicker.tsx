import { i, id, init, tx } from '@instantdb/react';
import { useEffect, useState } from 'react';
import config from '../../config';

const schema = i.schema({
  entities: {
    flicker: i.entity({
      count: i.number(),
    }),
  },
});

const db = init({ ...config, schema });
const the_id = '4a14b14b-3096-49d9-be47-5dd792cbd467';

function App() {
  return <Main />;
}

function autoclick() {
  let i = 0;

  const set = () => {
    console.log('db.transact', i);
    db.transact(
      db.tx.flicker[the_id].update({
        count: i,
      }),
    );
    i += 1;
    if (i < 200) {
      setTimeout(set, 10);
    }
  };

  set();
}

function Main() {
  const [states, setStates] = useState<number[]>([]);
  const { isLoading, error, data } = db.useQuery({
    flicker: {
      $: {
        where: {
          id: the_id,
        },
      },
    },
  });

  useEffect(() => {
    setStates([...states, isLoading || error ? -1 : item.count]);
  }, [data]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const item = data.flicker[0];

  return (
    <div className="p-10 flex flex-col gap-1">
      <div>
        {item.id} {': '} {item.count}
      </div>

      <div className="flex flex-row gap-1">
        <button
          className="rounded-lg bg-gray-500 px-3 py-2 text-sm/6 font-bold text-white"
          onClick={() => {
            db.transact(
              db.tx.flicker[the_id].update({ count: item.count + 1 }),
            );
            console.log('db.transact', item.count + 1);
          }}
        >
          Increment
        </button>
        <button
          className="rounded-lg bg-gray-500 px-3 py-2 text-sm/6 font-bold text-white"
          onClick={() => {
            db.transact(db.tx.flicker[the_id].update({ count: 0 }));
          }}
        >
          Reset
        </button>
        <button
          className="rounded-lg bg-gray-500 px-3 py-2 text-sm/6 font-bold text-white"
          onClick={() => {
            setStates([]);
            autoclick();
          }}
        >
          Autoclick
        </button>
      </div>

      <div className="flex flex-row gap-1 flex-wrap">
        {states.map((state, i) => {
          let correct = i == 0 || states[i - 1] + 1 == state;
          return (
            <span
              className={'px-1 ' + (correct ? 'bg-gray-200' : 'bg-red-200')}
            >
              {state}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default App;
