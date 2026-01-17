import { init, tx } from '@instantdb/react';
import { useRef } from 'react';
import config from '../../config';

const db = init(config);

const singletonIdX = '23c755b5-a703-4354-b0d2-d921d8846722';
const singletonIdY = '23c755b5-a703-4354-b0d2-d921d8846723';

export default function Patch() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const r = db.useQuery({
    blocks: {
      refs: {},
    },
    refs: {},
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 font-mono text-sm">
      <button className="border border-black" onClick={reset}>
        reset state
      </button>
      <div className="flex flex-col gap-2 border border-black p-4">
        <em>Block data (editable)</em>
        <textarea
          className="bg-gray-50"
          ref={ref}
          defaultValue={JSON.stringify({ new_key: 'edit_me' })}
        ></textarea>
        <button className="border border-black" onClick={merge}>
          merge `nestedData` with above input
        </button>
      </div>
      <button className="border border-black" onClick={mergeWithNull}>
        merge `nestedData` with `null`
      </button>
      <button className="border border-black" onClick={mergeWithDeepUndef}>
        merge `nestedData` with `{`{new_key:undefined}`}`
      </button>
      <button className="border border-black" onClick={mergeWithUndefArray}>
        merge `nestedData` with `{`{new_key:[1, undefined, 2]}`}`
      </button>
      <button className="border border-black" onClick={deleteAttr}>
        delete `nestedData` attribute
      </button>
      <button className="border border-black" onClick={mergeRef}>
        merge `refs` (throws error)
      </button>
      <pre className="overflow-scroll border border-black bg-gray-100">
        {JSON.stringify(r.data, null, 2)}
      </pre>
    </div>
  );

  function merge() {
    const nestedData = JSON.parse(ref.current!.value);

    db.transact([
      tx.blocks[singletonIdX].merge({
        nestedData,
      }),
    ]);
  }

  function mergeWithNull() {
    db.transact([
      tx.blocks[singletonIdX].merge({
        nestedData: null,
      }),
    ]);
  }

  function mergeWithDeepUndef() {
    db.transact([
      tx.blocks[singletonIdX].merge({
        nestedData: { new_key: undefined },
      }),
    ]);
  }

  function mergeWithUndefArray() {
    db.transact([
      tx.blocks[singletonIdX].merge({
        nestedData: { new_key: [1, undefined, 2] },
      }),
    ]);
  }

  function mergeRef() {
    const nestedData = JSON.parse(ref.current!.value);

    db.transact([
      tx.blocks[singletonIdX].merge({
        refs: nestedData,
      }),
    ]);
  }

  async function reset() {
    db.transact([
      tx.refs[singletonIdY].update({ data: {} }),
      tx.blocks[singletonIdX].update({ nestedData: {} }),
      tx.blocks[singletonIdX].link({ refs: singletonIdY }),
    ]);
  }

  function deleteAttr() {
    db.transact([tx.x[singletonIdX].delete()]);
  }
}
