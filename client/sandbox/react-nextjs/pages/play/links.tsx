import { init, tx, id } from "@instantdb/react";
import { useRef } from "react";
import config from "../../config";

const db = init(config);

export default function Links() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const r = db.useQuery({
    blocks: {
      newNs: {},
    },
    newNs2: {},
    refs: {},
  });

  return (
    <div className="p-4 text-sm font-mono flex flex-col mx-auto max-w-md gap-4">
      {JSON.stringify(r.data, null, 2)}
      <button className="border border-black" onClick={createALink}>
        try
      </button>
    </div>
  );

  async function createALink() {
    const blockA = id();
    const newNsId = id();
    await db.transact([
      tx.blocks[blockA].link({
        newNs2: id(),
      }),
    ]);
  }
}
