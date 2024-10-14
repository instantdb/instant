import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import { db } from '@/db';
import { FileType, StickerType } from 'src/Schema';
import { id, tx } from '@instantdb/react';
import { batchTransact } from '@/utils/db/db';
import { useEffect, useRef, useState } from 'react';
import { TransactionProgress } from '@/utils/db/db';

function App() {
  const [showJson, setShowJson] = useState(true);
  const [pending, setPending] = useState<
    Map<string, Omit<TransactionProgress, 'transactionId'>>
  >(new Map());
  const {
    error: errorStickers,
    isLoading: isLoadingStickers,
    data: persistedStickers,
  } = db.useQuery({ stickers: { files: {} } });
  const {
    error: errorFiles,
    isLoading: isLoadingFiles,
    data: persistedFiles,
  } = db.useQuery({ files: {} });

  const stickers = persistedStickers?.stickers;
  const files = persistedFiles?.files;

  const randomSticker = () => {
    const object: Omit<StickerType, 'id'> = {
      x: Math.random() * 1_000_000_000_000,
      y: Math.random() * 1_000_000_000_000,
      width: Math.random() * 1_000_000_000_000,
      height: Math.random() * 1_000_000_000_000,
      v: 0,
    };
    return object;
  };

  const randomFile = () => {
    const file: Omit<FileType, 'id'> = {
      name: (Math.random() + 1).toString(36).repeat(10),
    };
    return file;
  };

  const updateProgress = ({ transactionId, ...rest }: TransactionProgress) => {
    setPending((prev) => {
      const newPending = new Map(prev);
      newPending.set(transactionId, rest);
      return newPending;
    });
  };

  const randomElement = <T,>(array: T[]) =>
    array[Math.floor(Math.random() * array.length)];

  const handleCreateFile = (count: number) => {
    const txs = [];
    for (let i = 0; i < count; i++) {
      txs.push(tx.files?.[id()]?.update(randomFile()));
    }
    batchTransact(txs, updateProgress);
  };

  const handleCreateAndLinkSticker = (count: number) => {
    const txs = [];
    for (let i = 0; i < count; i++) {
      const randomFile = randomElement(files ?? []);
      txs.push(
        tx.stickers?.[id()]
          ?.update(randomSticker())
          .link({ files: randomFile?.id ? [randomFile.id] : [] })
      );
    }
    batchTransact(txs, updateProgress);
  };

  const handleDelete = () => {
    const txs = [];
    if (stickers) {
      for (const sticker of stickers) {
        const { id } = sticker;
        txs.push(tx.stickers?.[id]?.delete());
      }
    }
    if (files) {
      for (const file of files) {
        const { id } = file;
        txs.push(tx.files?.[id]?.delete());
      }
    }
    updated.current = false;
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

  const updated = useRef(false);
  useEffect(() => {
    if (stickers?.length && !updated.current) {
      console.log('updating stickers');
      const txs = [];
      for (const sticker of stickers) {
        txs.push(tx.stickers?.[sticker.id]?.update({ v: sticker.v + 1 }));
      }
      batchTransact(txs, updateProgress);
      updated.current = true;
    }
  }, [stickers]);

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img
            src="https://www.instantdb.com/img/icon/logo-512.svg"
            className="logo instant"
            alt="React logo"
          />
        </a>
      </div>
      <h1>Vite + React + Instant</h1>
      <div className="card">
        {isLoadingFiles || isLoadingStickers ? (
          'Loading...'
        ) : errorFiles || errorStickers ? (
          'Error — stickers: ' +
          (errorStickers?.message ?? '') +
          ' — files: ' +
          (errorFiles?.message ?? '')
        ) : (
          <>
            <button onClick={() => handleCreateFile(1)}>Create a file</button>
            <button onClick={() => handleCreateAndLinkSticker(1)}>
              Create a sticker and link it to an existing file
            </button>
            <button onClick={() => handleDelete()}>Delete all</button>
            <button onClick={() => setShowJson((prev) => !prev)}>
              Toggle JSON
            </button>
          </>
        )}
      </div>
      <h2>
        {stickers ? stickers.length : 0} stickers {computeProgress()}
      </h2>
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
          {stickers ? JSON.stringify(stickers, null, 2) : 'no stickers'}
        </pre>
      ) : null}
      <h2>{files ? files.length : 0} files</h2>
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
          {files ? JSON.stringify(files, null, 2) : 'no files'}
        </pre>
      ) : null}
    </>
  );
}

export default App;
