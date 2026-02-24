import { useMemo, useRef } from 'react';
import { tx, id, i, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    items: i.entity({
      ordinal: i.number().indexed(),
      value: i.string().indexed(),
    }),
  },
});

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const pageSize = 4;
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const scrollResult = db.useInfiniteQuery('items', {
    $: {
      pageSize,
      order: {
        value: 'asc',
      },
    },
  });

  const valueForOrdinal = (ordinal: number) => {
    if (ordinal === 0) return 'a';
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const letter = alphabet[(ordinal - 1) % alphabet.length];
    const repeat = Math.floor((ordinal - 1) / alphabet.length) + 2;
    return letter.repeat(repeat);
  };

  const addItems = (count: number) => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const maxOrdinal = existing.reduce(
        (max, item) => Math.max(max, item.ordinal ?? -1),
        -1,
      );
      const ops = Array.from({ length: count }, (_, idx) => {
        const ordinal = maxOrdinal + idx + 1;
        return tx.items[id()].update({
          ordinal,
          value: valueForOrdinal(ordinal),
        });
      });
      await db.transact(ops);
    });
  };

  const addNumberItem = () => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];

      const maxOrdinal = existing.reduce(
        (max, item) => Math.max(max, item.ordinal ?? -1),
        -1,
      );

      const maxNumericValue = existing.reduce((max, item) => {
        if (!/^\d+$/.test(item.value)) return max;
        const parsed = Number(item.value);
        return Number.isNaN(parsed) ? max : Math.max(max, parsed);
      }, 0);

      await db.transact([
        tx.items[id()].update({
          ordinal: maxOrdinal + 1,
          value: String(maxNumericValue + 1),
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
    () => (scrollResult.data || []).map((item) => item.value),
    [scrollResult.data],
  );

  return (
    <div>
      <div>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => addItems(1)}
        >
          Add item
        </button>
        <button className="m-2 bg-black p-2 text-white" onClick={addNumberItem}>
          Add number item
        </button>
        <button
          className="m-2 bg-black p-2 text-white"
          onClick={() => addItems(30)}
        >
          Add 30 items
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
        disabled={!scrollResult.canLoadMore}
        onClick={() => scrollResult.loadMore()}
      >
        Load more
      </button>

      <div className="m-2 grid gap-2 md:grid-cols-2">
        <div className="border border-gray-300 bg-gray-100 p-3 text-xs">
          <h3 className="font-bold">Infinite Query Diagnostics</h3>
          <pre>{JSON.stringify(scrollResult.chunks, null, 2)}</pre>
        </div>

        <div className="border border-gray-300 p-3">
          <h3 className="font-bold">Loaded items ({loadedValues.length})</h3>
          {loadedValues.length === 0 ? <div>No items loaded yet.</div> : null}
          {scrollResult.data.map((item) => (
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
