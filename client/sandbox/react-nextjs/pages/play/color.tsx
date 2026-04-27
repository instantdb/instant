import { i, init, tx } from '@instantdb/react';
import { useEffect, useRef, useState } from 'react';
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

const btnClass =
  'bg-gray-800/70 hover:bg-gray-800/85 active:bg-gray-900/85 text-white font-medium text-sm px-4 py-2 rounded-lg border border-white/10 shadow-md backdrop-blur-sm transition-colors active:translate-y-px focus:outline-none focus:ring-2 focus:ring-white/60 cursor-pointer';

const panelClass =
  'bg-gray-800/70 text-white text-sm font-medium px-4 py-3 rounded-lg border border-white/10 shadow-md backdrop-blur-sm inline-flex items-center gap-5';

const inputClass =
  'w-14 bg-gray-900/60 text-white tabular-nums px-2 py-0.5 rounded-md border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/40';

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
  const [autoCycle, setAutoCycle] = useState(false);
  const [rate, setRate] = useState(1);
  const [txCount, setTxCount] = useState(0);
  const colorRef = useRef('grey');
  const { isLoading, error, data } = db.useQuery({
    colors: {},
  });
  const color = data?.colors?.[0]?.color ?? 'grey';
  colorRef.current = color;

  useEffect(() => {
    if (!autoCycle) return;
    const interval = Math.floor(1000 / rate);
    let i = colorOptions.indexOf(colorRef.current);
    if (i === -1) i = 0;
    const id = setInterval(() => {
      i = (i + 1) % colorOptions.length;
      db.transact(tx.colors[selectId].update({ color: colorOptions[i] }));
      setTxCount((n) => n + 1);
    }, interval);
    return () => clearInterval(id);
  }, [autoCycle, rate]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div
      style={{
        background: color,
        height: '100vh',
        transition: 'background 120ms ease',
      }}
    >
      <div className="space-y-4 p-4 text-white">
        <h1 className="text-2xl font-semibold tracking-tight drop-shadow-sm">
          Hi! pick your favorite color
        </h1>
        <div className="space-x-4">
          {colorOptions.map((c) => {
            return (
              <button
                onClick={() => {
                  db.transact(tx.colors[selectId].update({ color: c }));
                }}
                className={btnClass}
                key={c}
              >
                {c}
              </button>
            );
          })}
          <button
            className={btnClass}
            onClick={() => {
              db.transact(
                tx.colors[selectId].update({ color: nextColor(color) }),
              );
            }}
          >
            Cycle
          </button>
        </div>
        <div className={panelClass}>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-white"
              checked={autoCycle}
              onChange={(e) => {
                setAutoCycle(e.target.checked);
                if (e.target.checked) setTxCount(0);
              }}
            />
            <span>Auto-cycle</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <span className="text-white/80">Rate (tx/sec)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={rate}
              onChange={(e) =>
                setRate(Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
              className={inputClass}
            />
          </label>
          <span className="text-white/80">
            Sent <span className="text-white tabular-nums">{txCount}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
