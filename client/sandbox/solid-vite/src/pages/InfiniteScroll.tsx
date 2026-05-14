import { Show, createMemo, createSignal } from 'solid-js';
import { id, tx } from '@instantdb/solidjs';
import { dbState, resetEphemeralApp, type DB } from '../lib/db';

const pageSize = 4;

const btnStyle = {
  margin: '8px',
  padding: '8px',
  background: 'black',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
} as const;

function Demo({ db }: { db: DB }) {
  const [numberInput, setNumberInput] = createSignal('');
  let writeQueue: Promise<unknown> = Promise.resolve();

  const enqueue = (work: () => Promise<unknown>) => {
    writeQueue = writeQueue.then(work, work);
  };

  const scrollResult = db.useInfiniteQuery({
    items: {
      $: { limit: pageSize, order: { value: 'asc' } },
    },
  });
  const allNumbersResult = db.useQuery({ items: {} });

  const addNumberItem = (value: number) => {
    enqueue(() => db.transact([tx.items[id()].update({ value })]));
  };

  const submitNumber = () => {
    const parsed = Number(numberInput());
    if (!Number.isFinite(parsed)) return;
    addNumberItem(parsed);
    setNumberInput('');
  };

  const addNewLowest = () => {
    enqueue(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const minValue = existing.reduce(
        (min, item) => Math.min(min, item.value),
        Number.POSITIVE_INFINITY,
      );
      const nextValue = Number.isFinite(minValue) ? minValue - 1 : -1;
      await db.transact([tx.items[id()].update({ value: nextValue })]);
    });
  };

  const addNewHighest = () => {
    enqueue(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const maxValue = existing.reduce(
        (max, item) => Math.max(max, item.value),
        Number.NEGATIVE_INFINITY,
      );
      const nextValue = Number.isFinite(maxValue) ? maxValue + 1 : 1;
      await db.transact([tx.items[id()].update({ value: nextValue })]);
    });
  };

  const deleteAll = async () => {
    const snapshot = await db.queryOnce({ items: {} });
    const existing = snapshot.data.items || [];
    if (existing.length === 0) return;
    await db.transact(existing.map((item) => tx.items[item.id].delete()));
  };

  const numberLineValues = createMemo(() =>
    [...(allNumbersResult().data?.items || [])].sort(
      (a, b) => a.value - b.value,
    ),
  );
  const loadedValues = createMemo(() => scrollResult().data?.items || []);

  return (
    <div style={{ padding: '16px', 'font-family': 'sans-serif' }}>
      <div>
        <input
          style={{
            margin: '8px',
            padding: '8px',
            border: '1px solid #999',
          }}
          type="number"
          value={numberInput()}
          onInput={(e) => setNumberInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNumber();
          }}
          placeholder="Type a number"
        />
        <button style={btnStyle} onClick={submitNumber}>
          Add number
        </button>
        <button style={btnStyle} onClick={addNewLowest}>
          Add new lowest
        </button>
        <button style={btnStyle} onClick={() => addNumberItem(0)}>
          Add zero
        </button>
        <button style={btnStyle} onClick={addNewHighest}>
          Add new highest
        </button>
        <button style={btnStyle} onClick={deleteAll}>
          Delete all
        </button>
        <button style={btnStyle} onClick={resetEphemeralApp}>
          Start over
        </button>
      </div>

      <button
        style={{
          ...btnStyle,
          opacity: scrollResult().canLoadNextPage ? 1 : 0.5,
        }}
        disabled={!scrollResult().canLoadNextPage}
        onClick={() => scrollResult().loadNextPage()}
      >
        Load more
      </button>

      <div style={{ margin: '8px', padding: '12px', border: '1px solid #ccc' }}>
        <h3 style={{ 'font-weight': 'bold' }}>
          Number line ({numberLineValues().length})
        </h3>
        <Show
          when={numberLineValues().length > 0}
          fallback={
            <div style={{ 'margin-top': '8px', 'font-size': '14px' }}>
              No numbers yet.
            </div>
          }
        >
          <div style={{ 'margin-top': '12px', 'overflow-x': 'auto' }}>
            <div
              style={{
                'min-width': 'max-content',
                'border-top': '2px solid black',
                padding: '0 16px 8px',
              }}
            >
              <div style={{ display: 'flex', gap: '24px' }}>
                {numberLineValues().map((item) => (
                  <div
                    style={{
                      'margin-top': '-16px',
                      display: 'flex',
                      'flex-direction': 'column',
                      'align-items': 'center',
                    }}
                  >
                    <div
                      style={{
                        height: '16px',
                        width: '1px',
                        background: 'black',
                      }}
                    />
                    <div
                      style={{
                        'margin-top': '4px',
                        'font-family': 'monospace',
                        'font-size': '14px',
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Show>
      </div>

      <div
        style={{
          display: 'grid',
          'grid-template-columns': '1fr 1fr',
          gap: '8px',
          margin: '8px',
        }}
      >
        <div
          style={{
            border: '1px solid #ccc',
            background: '#f5f5f5',
            padding: '12px',
            'font-size': '12px',
          }}
        >
          <h3 style={{ 'font-weight': 'bold' }}>Infinite Query Diagnostics</h3>
          <pre>canLoadNextPage: {String(scrollResult().canLoadNextPage)}</pre>
          <pre>isLoading: {String(scrollResult().isLoading)}</pre>
          <pre>loaded: {loadedValues().length}</pre>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '12px' }}>
          <h3 style={{ 'font-weight': 'bold' }}>
            Loaded items ({loadedValues().length})
          </h3>
          <Show
            when={loadedValues().length > 0}
            fallback={<div>No items loaded yet.</div>}
          >
            {loadedValues().map((item) => (
              <div style={{ 'font-family': 'monospace', 'font-size': '14px' }}>
                {item.value}
              </div>
            ))}
          </Show>
        </div>
      </div>
    </div>
  );
}

export default function InfiniteScroll() {
  return (
    <Show
      when={!dbState().isLoading}
      fallback={
        <div
          style={{
            padding: '32px',
            display: 'flex',
            'justify-content': 'center',
          }}
        >
          Creating ephemeral app...
        </div>
      }
    >
      <Show
        when={!dbState().error}
        fallback={
          <div style={{ padding: '32px', color: 'red' }}>
            Error: {dbState().error}
          </div>
        }
      >
        <Demo db={dbState().db!} />
      </Show>
    </Show>
  );
}
