import { i, init, tx } from '@instantdb/react';
import { useEffect } from 'react';
import config from '../../config';

const schema = i.schema({
  entities: {
    colors: i.entity({ color: i.string() }),
  },
});

const db = init({ ...config, schema });

function App() {
  return <Main />;
}

const selectId = '4d39508b-9ee2-48a3-b70d-8192d9c5a059';

const colorOptions = ['green', 'blue', 'purple'];

function nextColor(c: string): string {
  const i = colorOptions.indexOf(c);
  if (i === -1) {
    return colorOptions[0];
  }
  return colorOptions[(i + 1) % colorOptions.length];
}

function Main() {
  useEffect(() => {
    (async () => {
      const id = await db.getLocalId('user');
      console.log('localId', id);
    })();
  }, []);
  const { isLoading, error, data } = db.useQuery({
    colors: {},
  });
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  const { colors } = data;
  const { color } = colors[0] || { color: 'grey' };
  return (
    <div style={{ background: color, height: '100vh' }}>
      <div className="space-y-4">
        <h1>Hi! pick your favorite color</h1>
        <div className="space-x-4">
          {colorOptions.map((c) => {
            return (
              <button
                onClick={() => {
                  db.transact(tx.colors[selectId].update({ color: c }));
                }}
                className={`bg-white p-2`}
                key={c}
              >
                {c}
              </button>
            );
          })}
          <button
            className={`bg-white p-2`}
            onClick={() => {
              db.transact(
                tx.colors[selectId].update({ color: nextColor(color) }),
              );
            }}
          >
            Cycle
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
