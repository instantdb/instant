import { useMemo, useRef, useState } from 'react';

import { tx, id, i, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    items: i.entity({
      value: i.number().indexed(),
    }),
  },
});

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const pageSize = 4;
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [numberInput, setNumberInput] = useState('');

  const scrollResult = db.useInfiniteQuery({
    items: {
      $: {
        limit: pageSize,

        order: {
          value: 'asc',
        },
      },
    },
  });

  const allNumbersResult = db.useQuery({
    items: {},
  });

  const addNumberItem = (value: number) => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      await db.transact([
        tx.items[id()].update({
          value,
        }),
      ]);
    });
  };

  const submitNumber = () => {
    const parsed = Number(numberInput);
    if (!Number.isFinite(parsed)) return;
    addNumberItem(parsed);
    setNumberInput('');
  };

  const addNewLowest = () => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const minValue = existing.reduce(
        (min, item) => Math.min(min, item.value),
        Number.POSITIVE_INFINITY,
      );
      const nextValue = Number.isFinite(minValue) ? minValue - 1 : -1;
      await db.transact([
        tx.items[id()].update({
          value: nextValue,
        }),
      ]);
    });
  };

  const addZero = () => {
    addNumberItem(0);
  };

  const addNewHighest = () => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const maxValue = existing.reduce(
        (max, item) => Math.max(max, item.value),
        Number.NEGATIVE_INFINITY,
      );
      const nextValue = Number.isFinite(maxValue) ? maxValue + 1 : 1;
      await db.transact([
        tx.items[id()].update({
          value: nextValue,
        }),
      ]);
    });
  };

  const deleteAll = async () => {
    const snapshot = await db.queryOnce({ items: {} });
    const existing = snapshot.data.items || [];
    if (existing.length === 0) return;
    await db.transact(existing.map((item) => tx.items[item.id].delete()));
  };

  const loadedValues = useMemo(
    () => (scrollResult.data?.items || []).map((item) => item.value),
    [scrollResult.data],
  );
  const numberLineValues = useMemo(
    () =>
      [...(allNumbersResult.data?.items || [])].sort(
        (a, b) => a.value - b.value,
      ),
    [allNumbersResult.data],
  );

  return (
    <div>
      <pre>{JSON.stringify(scrollResult, null, 2)}</pre>
      <div>
        <input
          className="m-2 border border-gray-400 p-2"
          type="number"
          value={numberInput}
          onChange={(e) => setNumberInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNumber();
          }}
          placeholder="Type a number"
        />
        <button className="m-2 bg-black p-2 text-white" onClick={submitNumber}>
          Add number
        </button>
        <button className="m-2 bg-black p-2 text-white" onClick={addNewLowest}>
          Add new lowest
        </button>
        <button className="m-2 bg-black p-2 text-white" onClick={addZero}>
          Add zero
        </button>
        <button className="m-2 bg-black p-2 text-white" onClick={addNewHighest}>
          Add new highest
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => deleteAll()}
        >
          Delete all
        </button>
        <ResetButton
          label="Start over"
          className="m-2 bg-black p-2 text-white"
        />
      </div>

      <button
        className="m-2 bg-black p-2 text-white disabled:opacity-50"
        disabled={!scrollResult.canLoadNextPage}
        onClick={() => scrollResult.loadNextPage()}
      >
        Load more
      </button>

      <div className="m-2 border border-gray-300 p-3">
        <h3 className="font-bold">Number line ({numberLineValues.length})</h3>
        {numberLineValues.length === 0 ? (
          <div className="mt-2 text-sm">No numbers yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-max border-t-2 border-black px-4 pb-2">
              <div className="flex gap-6">
                {numberLineValues.map((item) => (
                  <div
                    key={item.id}
                    className="-mt-4 flex flex-col items-center"
                  >
                    <div className="h-4 w-px bg-black" />
                    <div className="mt-1 font-mono text-sm">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="m-2 grid gap-2 md:grid-cols-2">
        <div className="border border-gray-300 bg-gray-100 p-3 text-xs">
          <h3 className="font-bold">Infinite Query Diagnostics</h3>
          {/* @ts-ignore */}
          <pre>{JSON.stringify(scrollResult.chunks, null, 2)}</pre>
        </div>

        <div className="border border-gray-300 p-3">
          <h3 className="font-bold">Loaded items ({loadedValues.length})</h3>
          {loadedValues.length === 0 ? <div>No items loaded yet.</div> : null}
          {scrollResult.data?.items.map((item) => (
            <div key={item.id} className="font-mono text-sm">
              {item.value}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={Example} />;
}
