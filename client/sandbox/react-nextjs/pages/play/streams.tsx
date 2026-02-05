import { useState, useRef, useCallback, useEffect } from 'react';
import { i, init, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {},
});

function randomUUID() {
  return crypto.randomUUID();
}

function Writer({
  db,
  clientId,
  setClientId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  clientId: string;
  setClientId: (id: string) => void;
}) {
  // @ts-ignore
  globalThis._db = db;
  const [status, setStatus] = useState<
    'idle' | 'creating' | 'open' | 'closed' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [sentLines, setSentLines] = useState<string[]>([]);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const writerRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const streamRef = useRef<WritableStream<string> | null>(null);
  const [autoPing, setAutoPing] = useState(false);
  const [autoPingInterval, setAutoPingInterval] = useState(1000);
  const autoPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [auto1MB, setAuto1MB] = useState(false);
  const [auto1MBInterval, setAuto1MBInterval] = useState(1000);
  const auto1MBRef = useRef<{ running: boolean }>({ running: false });

  useEffect(() => {
    if (autoPingRef.current) {
      clearInterval(autoPingRef.current);
      autoPingRef.current = null;
    }
    if (autoPing && writerRef.current) {
      autoPingRef.current = setInterval(async () => {
        if (!writerRef.current) return;
        const chunk = JSON.stringify({ event: 'ping', ts: Date.now() });
        try {
          await writerRef.current.write(chunk + '\n');
          setSentLines((prev) => [...prev, chunk]);
        } catch (e: any) {
          setError(e.message);
          setStatusLog((prev) => [...prev, `Auto-ping error: ${e.message}`]);
          setAutoPing(false);
        }
      }, autoPingInterval);
    }
    return () => {
      if (autoPingRef.current) {
        clearInterval(autoPingRef.current);
        autoPingRef.current = null;
      }
    };
  }, [autoPing, autoPingInterval]);

  useEffect(() => {
    auto1MBRef.current.running = auto1MB;
    if (!auto1MB) return;
    let cancelled = false;
    const write1MB = async () => {
      const chunkSize = 200 * 1024;
      const totalChunks = 5;
      for (let i = 0; i < totalChunks; i++) {
        if (!auto1MBRef.current.running || cancelled) return;
        if (!writerRef.current) {
          setAuto1MB(false);
          return;
        }
        const chunk = 'x'.repeat(chunkSize) + '\n';
        try {
          await writerRef.current.write(chunk);
          setSentLines((prev) => [...prev, `chunk ${i + 1}/${totalChunks} (200KB)`]);
        } catch (e: any) {
          setError(e.message);
          setStatusLog((prev) => [...prev, `Write error on chunk ${i + 1}: ${e.message}`]);
          setAuto1MB(false);
          return;
        }
      }
    };
    write1MB();
    const id = setInterval(write1MB, auto1MBInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [auto1MB, auto1MBInterval]);

  const createStream = useCallback(async () => {
    setStatus('creating');
    setError(null);
    setSentLines([]);
    setStatusLog([]);
    try {
      const stream = (db as any).core._reactor.createWriteStream({
        clientId: clientId || undefined,
      });
      streamRef.current = stream;
      const writer = stream.getWriter();
      writerRef.current = writer;
      setStatus('open');
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  }, [db, clientId]);

  const writeChunk = useCallback(
    async (chunk: string) => {
      if (!writerRef.current) return;
      try {
        await writerRef.current.write(chunk + '\n');
        setSentLines((prev) => [...prev, chunk]);
      } catch (e: any) {
        setError(e.message);
        setStatusLog((prev) => [...prev, `Write error: ${e.message}`]);
      }
    },
    [],
  );

  const closeStream = useCallback(async () => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.close();
      setAutoPing(false);
      setAuto1MB(false);
      setStatus('closed');
      writerRef.current = null;
      streamRef.current = null;
    } catch (e: any) {
      setError(e.message);
      setStatusLog((prev) => [...prev, `Close error: ${e.message}`]);
    }
  }, []);

  const abortStream = useCallback(async () => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.abort('User aborted');
      setAutoPing(false);
      setAuto1MB(false);
      setStatus('closed');
      writerRef.current = null;
      streamRef.current = null;
    } catch (e: any) {
      setError(e.message);
      setStatusLog((prev) => [...prev, `Abort error: ${e.message}`]);
    }
  }, []);

  const createAndWrite = useCallback(async () => {
    setStatus('creating');
    setError(null);
    setSentLines([]);
    setStatusLog([]);
    try {
      const stream = (db as any).core._reactor.createWriteStream({
        clientId: clientId || undefined,
      });
      streamRef.current = stream;
      const writer = stream.getWriter();
      writerRef.current = writer;
      setStatus('open');
      await writer.write('Hello from createAndWrite!\n');
      setSentLines((prev) => [...prev, 'Hello from createAndWrite!']);
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  }, [db, clientId]);

  return (
    <div className="flex flex-col gap-3 overflow-auto rounded border p-4">
      <h2 className="text-lg font-bold">Writer</h2>

      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-sm text-gray-600">
          Client ID
          <button
            onClick={() => setClientId(randomUUID())}
            disabled={status === 'open' || status === 'creating'}
            className="disabled:opacity-30"
            title="Regenerate Client ID"
          >
            ↻
          </button>
        </span>
        <input
          className="rounded border px-2 py-1 font-mono text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={status === 'open' || status === 'creating'}
        />
      </label>

      <div className="text-sm">
        Status:{' '}
        <span
          className={
            status === 'open'
              ? 'text-green-600'
              : status === 'error'
                ? 'text-red-600'
                : 'text-gray-600'
          }
        >
          {status}
        </span>
      </div>

      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      {status !== 'open' && (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={createStream}
            disabled={status === 'creating'}
          >
            Create Stream
          </button>
          <button
            className="rounded bg-purple-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={createAndWrite}
            disabled={status === 'creating'}
          >
            Create & Write
          </button>
        </div>
      )}

      {status === 'open' && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Write defaults:</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded bg-gray-700 px-3 py-1 text-sm text-white"
              onClick={() => writeChunk('Hello, world!')}
            >
              "Hello, world!"
            </button>
            <button
              className="rounded bg-gray-700 px-3 py-1 text-sm text-white"
              onClick={() => writeChunk('The quick brown fox jumps over the lazy dog.')}
            >
              "The quick brown fox..."
            </button>
            <button
              className="rounded bg-gray-700 px-3 py-1 text-sm text-white"
              onClick={() =>
                writeChunk(JSON.stringify({ event: 'ping', ts: Date.now() }))
              }
            >
              JSON ping
            </button>
            <button
              className="rounded bg-gray-700 px-3 py-1 text-sm text-white"
              onClick={async () => {
                if (!writerRef.current) return;
                const chunkSize = 200 * 1024;
                const totalChunks = 5;
                for (let i = 0; i < totalChunks; i++) {
                  const chunk = 'x'.repeat(chunkSize) + '\n';
                  try {
                    await writerRef.current.write(chunk);
                    setSentLines((prev) => [...prev, `chunk ${i + 1}/${totalChunks} (200KB)`]);
                  } catch (e: any) {
                    setError(e.message);
                    setStatusLog((prev) => [...prev, `Write error on chunk ${i + 1}: ${e.message}`]);
                    break;
                  }
                }
              }}
            >
              1MB (5x200KB)
            </button>
            <button
              className={`rounded px-3 py-1 text-sm text-white ${autoPing ? 'bg-yellow-600' : 'bg-gray-700'}`}
              onClick={() => setAutoPing((v) => !v)}
            >
              {autoPing ? 'Stop auto ping' : 'Auto ping'}
            </button>
            <button
              className={`rounded px-3 py-1 text-sm text-white ${auto1MB ? 'bg-yellow-600' : 'bg-gray-700'}`}
              onClick={() => setAuto1MB((v) => !v)}
            >
              {auto1MB ? 'Stop auto 1MB' : 'Auto 1MB'}
            </button>
          </div>

          {autoPing && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Ping interval:</span>
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={autoPingInterval}
                onChange={(e) => setAutoPingInterval(Number(e.target.value))}
                className="w-32"
              />
              <span className="font-mono">{autoPingInterval}ms</span>
            </div>
          )}

          {auto1MB && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">1MB interval:</span>
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={auto1MBInterval}
                onChange={(e) => setAuto1MBInterval(Number(e.target.value))}
                className="w-32"
              />
              <span className="font-mono">{auto1MBInterval}ms</span>
            </div>
          )}

          <div className="flex gap-2">
            <input
              className="flex-1 rounded border px-2 py-1 text-sm"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Type a custom string..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customInput) {
                  writeChunk(customInput);
                  setCustomInput('');
                }
              }}
            />
            <button
              className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={!customInput}
              onClick={() => {
                writeChunk(customInput);
                setCustomInput('');
              }}
            >
              Write
            </button>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded bg-red-600 px-3 py-1 text-sm text-white"
              onClick={closeStream}
            >
              Close
            </button>
            <button
              className="rounded bg-red-800 px-3 py-1 text-sm text-white"
              onClick={abortStream}
            >
              Abort
            </button>
          </div>
        </div>
      )}

      {statusLog.length > 0 && (
        <div className="text-xs text-gray-500">
          {statusLog.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      {sentLines.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="text-sm font-medium">
            Sent lines ({sentLines.length}):
          </div>
          <div className="flex-1 overflow-y-auto rounded bg-gray-100 p-2 font-mono text-xs">
            {[...sentLines].reverse().map((entry, i) => (
              <div key={i}>{entry}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Reader({
  db,
  defaultClientId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  defaultClientId: string;
}) {
  const [clientId, setClientId] = useState(defaultClientId);
  const [status, setStatus] = useState<
    'idle' | 'reading' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [timeToFirst, setTimeToFirst] = useState<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const bufferRef = useRef('');
  const startTimeRef = useRef<number>(0);
  const gotFirstRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsed(Date.now() - startTimeRef.current);
  }, []);

  const startReading = useCallback(async () => {
    setStatus('reading');
    setError(null);
    setLines([]);
    setElapsed(null);
    setTimeToFirst(null);
    gotFirstRef.current = false;
    bufferRef.current = '';
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 50);
    try {
      const stream: ReadableStream<string> = (
        db as any
      ).core._reactor.createReadStream({
        clientId: clientId || undefined,
      });
      const reader = stream.getReader();
      readerRef.current = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value !== undefined) {
          bufferRef.current += value;
          const parts = bufferRef.current.split('\n');
          bufferRef.current = parts.pop()!;
          const nonEmpty = parts.filter((p) => p.length > 0);
          if (nonEmpty.length > 0) {
            if (!gotFirstRef.current) {
              gotFirstRef.current = true;
              setTimeToFirst(Date.now() - startTimeRef.current);
            }
            setLines((prev) => [...prev, ...nonEmpty]);
          }
        }
      }
      if (bufferRef.current) {
        setLines((prev) => [...prev, bufferRef.current]);
        bufferRef.current = '';
      }
      readerRef.current = null;
      stopTimer();
      setStatus('done');
    } catch (e: any) {
      readerRef.current = null;
      stopTimer();
      setStatus('error');
      setError(e.message);
    }
  }, [db, clientId, stopTimer]);

  const cancelReader = useCallback(async () => {
    if (!readerRef.current) return;
    try {
      await readerRef.current.cancel('User cancelled');
      readerRef.current = null;
      stopTimer();
      setStatus('done');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3 overflow-auto rounded border p-4">
      <h2 className="text-lg font-bold">Reader</h2>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-600">Client ID</span>
        <input
          className="rounded border px-2 py-1 font-mono text-sm"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={status === 'reading'}
        />
      </label>

      <div className="text-sm">
        Status:{' '}
        <span
          className={
            status === 'reading'
              ? 'text-blue-600'
              : status === 'done'
                ? 'text-green-600'
                : status === 'error'
                  ? 'text-red-600'
                  : 'text-gray-600'
          }
        >
          {status}
        </span>
      </div>

      {elapsed !== null && (
        <div className="flex gap-4 font-mono text-sm text-gray-600">
          <span>Total: {(elapsed / 1000).toFixed(2)}s</span>
          {timeToFirst !== null && (
            <span>First line: {(timeToFirst / 1000).toFixed(2)}s</span>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      <div className="flex gap-2">
        <button
          className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={startReading}
          disabled={status === 'reading'}
        >
          Start Reading
        </button>
        <button
          className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          onClick={cancelReader}
          disabled={status !== 'reading'}
        >
          Cancel
        </button>
      </div>

      {lines.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="text-sm font-medium">
            Received lines ({lines.length}):
          </div>
          <div className="flex-1 overflow-y-auto rounded bg-gray-100 p-2 font-mono text-xs">
            {[...lines].reverse().map((line, i) => {
              const idx = lines.length - 1 - i;
              const isRepeat = line.length > 1024 && /^(.)\1+$/.test(line);
              const display = isRepeat
                ? `chunk (${(line.length / 1024).toFixed(0)}KB)`
                : line.length > 1024
                  ? `[${(line.length / 1024).toFixed(1)}KB] ${line.slice(0, 80)}...`
                  : line;
              return (
                <div key={idx}>
                  <span className="text-gray-400">[{idx}]</span> {display}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function App({
  db,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  const [clientId, setClientId] = useState(() => randomUUID());

  return (
    <div className="flex h-full flex-col gap-6">
      <h1 className="text-xl font-bold">Streams Playground</h1>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <Writer db={db} clientId={clientId} setClientId={setClientId} />
        <Reader db={db} defaultClientId={clientId} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto h-screen max-w-4xl p-4">
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
