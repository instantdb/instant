import './App.css';
import { db } from '@/db';
import { ObjectType } from 'src/Schema';
import { id, tx } from '@instantdb/react';
import { batchTransact } from '@/utils/db/db';
import { useState } from 'react';
import { TransactionProgress } from '@/utils/db/db';

function App() {
  const [showJson, setShowJson] = useState(true);
  const [pending, setPending] = useState<
    Map<string, Omit<TransactionProgress, 'transactionId'>>
  >(new Map());
  const [rawTransactTime, setRawTransactTime] = useState<number | null>(null);
  const {
    error,
    isLoading,
    data: persistedObjects,
  } = db.useQuery({ objects: {} });

  const randomObject = () => {
    const object: Omit<ObjectType, 'id'> = {
      x: Math.random() * 1_000_000_000_000,
      y: Math.random() * 1_000_000_000_000,
      width: Math.random() * 1_000_000_000_000,
      height: Math.random() * 1_000_000_000_000,
      attributes: {
        a: (Math.random() + 1).toString(36).repeat(10),
        b: (Math.random() + 1).toString(36).repeat(10),
        c: Math.random() * 1_000_000_000_000,
        d: Math.random() * 1_000_000_000_000,
        e: (Math.random() + 1).toString(36).repeat(10),
        f: (Math.random() + 1).toString(36).repeat(10),
        g: (Math.random() + 1).toString(36).repeat(10),
        h: (Math.random() + 1).toString(36).repeat(10),
      },
    };
    return object;
  };

  const updateProgress = ({ transactionId, ...rest }: TransactionProgress) => {
    setPending((prev) => {
      const newPending = new Map(prev);
      newPending.set(transactionId, rest);
      return newPending;
    });
  };

  const handleCreate = (count: number) => {
    const txs = [];
    for (let i = 0; i < count; i++) {
      txs.push(tx.objects?.[id()]?.update(randomObject()));
    }
    batchTransact(txs, updateProgress);
  };

  const handleCreateOne = async () => {
    const transaction = tx.objects?.[id()]?.update(randomObject()) as any;
    const start = performance.now();
    db.transact(transaction);
    const end = performance.now();
    setRawTransactTime(end - start);
  };

  const handleUpdate = (objectsToUpdate: ObjectType[]) => {
    const txs = [];
    for (let i = 0; i < objectsToUpdate.length; i++) {
      const objectToUpdate = objectsToUpdate[i];
      if (objectToUpdate) {
        const { id } = objectToUpdate;
        txs.push(tx.objects?.[id]?.update(randomObject()));
      }
    }
    batchTransact(txs, updateProgress);
  };

  const handleDelete = (objectsToUpdate: ObjectType[]) => {
    const txs = [];
    for (let i = 0; i < objectsToUpdate.length; i++) {
      const objectToUpdate = objectsToUpdate[i];
      if (objectToUpdate) {
        const { id } = objectToUpdate;
        txs.push(tx.objects?.[id]?.delete());
      }
    }
    batchTransact(txs, updateProgress);
  };

  const computeProgress = () => {
    let totalRemainingBatches = 0;
    let totalPendingBatches = 0;
    [...pending.values()].forEach(({ remainingBatches, totalBatches }) => {
      if (remainingBatches) {
        totalPendingBatches += totalBatches;
        totalRemainingBatches += remainingBatches;
      }
    });
    const formatter = Intl.NumberFormat('en-US', { style: 'percent' });
    return totalPendingBatches ? (
      <code
        style={{
          borderRadius: 8,
          fontSize: 16,
          padding: '4px 8px',
        }}
      >
        {formatter.format(
          (totalPendingBatches - totalRemainingBatches) / totalPendingBatches
        )}
      </code>
    ) : (
      ''
    );
  };

  const objects = persistedObjects?.objects;

  return (
    <>
      <h1>Vite + React + Instant</h1>
      <div className="card">
        {isLoading ? (
          'Loading...'
        ) : error ? (
          'Error ' + error.message
        ) : (
          <>
            <button onClick={() => handleCreate(500)}>
              Create 500 objects
            </button>
            <button onClick={() => handleCreateOne()}>
              Create 1 object (raw transact)
            </button>
            <button onClick={() => handleUpdate(objects ?? [])}>
              Update all
            </button>
            <button onClick={() => handleDelete(objects ?? [])}>
              Delete all
            </button>
            <button onClick={() => setShowJson((prev) => !prev)}>
              Toggle JSON
            </button>
          </>
        )}
      </div>
      <h2>
        {objects ? objects.length : 0} objects {computeProgress()}
      </h2>
      <span>{rawTransactTime}ms</span>
      {showJson ? (
        <pre
          style={{
            textAlign: 'left',
            maxWidth: '100%',
            padding: 12,
            borderRadius: 12,
            overflow: 'scroll',
          }}
        >
          {(objects || []).map((o) => {
            return <div key={o.id}>{JSON.stringify(o, null, 2)}</div>;
          })}
        </pre>
      ) : null}
    </>
  );
}

export default App;
