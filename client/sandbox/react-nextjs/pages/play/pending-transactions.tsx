import { init, id } from '@instantdb/react';
import { useEffect, useState } from 'react';
import config from '../../config';

const db = init(config);

function App() {
  return <Main />;
}

let n = 0;
function Main() {
  const query = db.useQuery({ stickers: {} });
  const [pendingTxs, setPendingTxs] = useState<any>(null);
  useEffect(() => {
    const unsub = db._core._reactor.pendingMutations.subscribe((txs: any) => {
      const copy = new Map(txs);
      setPendingTxs(copy);
    });
    return unsub;
  }, []);
  const pendingTxToPrint = [...(pendingTxs?.values() || [])].map((x) => {
    return x['tx-steps'][1][3];
  });
  return (
    <div>
      <ul>
        <li> Add a `(Thread/sleep (rand-int 5000))` to handle-transact </li>
        <li>
          {' '}
          Click `transact`, and make sure that we in fact _are_ processing
          transactions in order
        </li>
      </ul>
      <div className="space-x-2">
        <button
          className="bg-black text-white"
          onClick={() => {
            for (let i = 0; i < 100; i++) {
              db.transact(db.tx.stickers[id()].update({ n: n++ }));
            }
          }}
        >
          Transact
        </button>
        <button
          className="bg-black text-white"
          onClick={() => {
            db.transact(
              query.data?.stickers.map((x) => db.tx.strickers[x.id].delete()) ??
                [],
            );
          }}
        >
          clear
        </button>
      </div>
      <div className="flex">
        <div className="flex-1">
          <strong>Query Result</strong>
          <pre>{JSON.stringify(query, null, 2)}</pre>
        </div>
        <div className="flex-1">
          <strong>Pending Transactions</strong>
          <pre>{JSON.stringify(pendingTxToPrint, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export default App;
