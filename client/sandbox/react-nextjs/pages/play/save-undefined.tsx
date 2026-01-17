import { id, init, tx } from '@instantdb/react';
import { useRef } from 'react';
import config from '../../config';

const db = init(config);

const itemId = id();

export default function Page() {
  const { isLoading, error, data } = db.useQuery({
    items: {},
  });
  if (isLoading || error) return;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 font-mono text-sm">
      <button className="border border-black" onClick={() => reset(data.items)}>
        reset state
      </button>
      <button className="border border-black" onClick={() => create(itemId)}>
        create item
      </button>
      <button
        className="border border-black"
        onClick={() => createWithUndefined(itemId)}
      >
        create item with undefined
      </button>
      <pre className="overflow-scroll border border-black bg-gray-100">
        {JSON.stringify(data.items, null, 2)}
      </pre>
    </div>
  );
}

function reset(items: { id: string }[]) {
  db.transact(items.map((item) => db.tx.items[item.id].delete()));
}

function create(itemId: string) {
  db.transact([tx.items[itemId].update({ title: 'Hello', desc: undefined })]);
}

function createWithUndefined(itemId: string) {
  db.transact([tx.items[itemId].update({ title: 'Hello' })]);
}
