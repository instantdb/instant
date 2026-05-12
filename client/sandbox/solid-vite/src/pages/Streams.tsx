import { Show, createSignal } from 'solid-js';
import { dbState, resetEphemeralApp, type DB } from '../lib/db';

const btnStyle = {
  margin: '4px',
  padding: '8px',
  background: 'black',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
} as const;

const inputStyle = {
  padding: '6px',
  border: '1px solid #999',
  'font-family': 'monospace',
  'font-size': '12px',
} as const;

const panelStyle = {
  border: '1px solid #ccc',
  padding: '12px',
  display: 'flex',
  'flex-direction': 'column',
  gap: '8px',
} as const;

function Demo({ db }: { db: DB }) {
  const [clientId, setClientId] = createSignal<string>(crypto.randomUUID());

  const [writerStatus, setWriterStatus] = createSignal<
    'idle' | 'open' | 'closed' | 'error'
  >('idle');
  const [writerError, setWriterError] = createSignal<string | null>(null);
  const [writer, setWriter] =
    createSignal<WritableStreamDefaultWriter<string> | null>(null);
  const [sentLines, setSentLines] = createSignal<string[]>([]);
  const [customInput, setCustomInput] = createSignal('');

  const [readerClientId, setReaderClientId] = createSignal<string>(clientId());
  const [readerStatus, setReaderStatus] = createSignal<
    'idle' | 'reading' | 'done' | 'error'
  >('idle');
  const [readerError, setReaderError] = createSignal<string | null>(null);
  const [reader, setReader] =
    createSignal<ReadableStreamDefaultReader<string> | null>(null);
  const [receivedLines, setReceivedLines] = createSignal<string[]>([]);

  const regenerateClientId = () => {
    const next = crypto.randomUUID();
    setClientId(next);
    setReaderClientId(next);
  };

  const createWriter = () => {
    setWriterError(null);
    setSentLines([]);
    try {
      const stream = db.streams.createWriteStream({ clientId: clientId() });
      setWriter(stream.getWriter());
      setWriterStatus('open');
    } catch (e) {
      setWriterError((e as Error).message);
      setWriterStatus('error');
    }
  };

  const writeChunk = async (chunk: string) => {
    const w = writer();
    if (!w) return;
    try {
      await w.write(chunk + '\n');
      setSentLines((prev) => [...prev, chunk]);
    } catch (e) {
      setWriterError((e as Error).message);
    }
  };

  const closeWriter = async () => {
    const w = writer();
    if (!w) return;
    try {
      await w.close();
      setWriter(null);
      setWriterStatus('closed');
    } catch (e) {
      setWriterError((e as Error).message);
    }
  };

  const startReading = async () => {
    setReaderError(null);
    setReceivedLines([]);
    setReaderStatus('reading');
    try {
      const stream: ReadableStream<string> = db.streams.createReadStream({
        clientId: readerClientId(),
      });
      const r = stream.getReader();
      setReader(r);
      let buffer = '';
      while (true) {
        const { value, done } = await r.read();
        if (done) break;
        if (value !== undefined) {
          buffer += value;
          const parts = buffer.split('\n');
          buffer = parts.pop()!;
          const nonEmpty = parts.filter((p) => p.length > 0);
          if (nonEmpty.length > 0) {
            setReceivedLines((prev) => [...prev, ...nonEmpty]);
          }
        }
      }
      if (buffer) setReceivedLines((prev) => [...prev, buffer]);
      setReader(null);
      setReaderStatus('done');
    } catch (e) {
      setReader(null);
      setReaderStatus('error');
      setReaderError((e as Error).message);
    }
  };

  const cancelReader = async () => {
    const r = reader();
    if (!r) return;
    try {
      await r.cancel('User cancelled');
      setReader(null);
      setReaderStatus('done');
    } catch (e) {
      setReaderError((e as Error).message);
    }
  };

  return (
    <div
      style={{
        padding: '16px',
        'font-family': 'sans-serif',
        display: 'flex',
        'flex-direction': 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <span style={{ 'font-size': '14px' }}>Client ID</span>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={clientId()}
          onInput={(e) => setClientId(e.currentTarget.value)}
          disabled={writerStatus() === 'open'}
        />
        <button
          style={btnStyle}
          onClick={regenerateClientId}
          disabled={writerStatus() === 'open'}
        >
          New ID
        </button>
        <button style={btnStyle} onClick={resetEphemeralApp}>
          Start over
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          'grid-template-columns': '1fr 1fr',
          gap: '16px',
        }}
      >
        <div style={panelStyle}>
          <h2 style={{ 'font-size': '18px', 'font-weight': 'bold' }}>Writer</h2>
          <div style={{ 'font-size': '14px' }}>Status: {writerStatus()}</div>
          <Show when={writerError()}>
            <div style={{ 'font-size': '14px', color: 'red' }}>
              Error: {writerError()}
            </div>
          </Show>

          <Show
            when={writerStatus() === 'open'}
            fallback={
              <button
                style={{ ...btnStyle, background: '#2563eb', width: 'fit-content' }}
                onClick={createWriter}
              >
                Create stream
              </button>
            }
          >
            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}>
              <button
                style={{ ...btnStyle, background: '#374151' }}
                onClick={() => writeChunk('Hello, world!')}
              >
                "Hello, world!"
              </button>
              <button
                style={{ ...btnStyle, background: '#374151' }}
                onClick={() =>
                  writeChunk(JSON.stringify({ event: 'ping', ts: Date.now() }))
                }
              >
                JSON ping
              </button>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={customInput()}
                onInput={(e) => setCustomInput(e.currentTarget.value)}
                placeholder="Type a custom string..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customInput()) {
                    writeChunk(customInput());
                    setCustomInput('');
                  }
                }}
              />
              <button
                style={{
                  ...btnStyle,
                  background: '#374151',
                  opacity: customInput() ? 1 : 0.5,
                }}
                disabled={!customInput()}
                onClick={() => {
                  writeChunk(customInput());
                  setCustomInput('');
                }}
              >
                Write
              </button>
            </div>
            <button
              style={{ ...btnStyle, background: '#dc2626', width: 'fit-content' }}
              onClick={closeWriter}
            >
              Close
            </button>
          </Show>

          <Show when={sentLines().length > 0}>
            <div style={{ 'font-size': '14px', 'font-weight': 500 }}>
              Sent ({sentLines().length}):
            </div>
            <div
              style={{
                background: '#f3f4f6',
                padding: '8px',
                'font-family': 'monospace',
                'font-size': '12px',
                'max-height': '192px',
                'overflow-y': 'auto',
              }}
            >
              {[...sentLines()].reverse().map((line) => (
                <div>{line}</div>
              ))}
            </div>
          </Show>
        </div>

        <div style={panelStyle}>
          <h2 style={{ 'font-size': '18px', 'font-weight': 'bold' }}>Reader</h2>
          <label
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '8px',
              'font-size': '14px',
            }}
          >
            Client ID
            <input
              style={{ ...inputStyle, flex: 1, 'font-size': '11px' }}
              value={readerClientId()}
              onInput={(e) => setReaderClientId(e.currentTarget.value)}
              disabled={readerStatus() === 'reading'}
            />
          </label>
          <div style={{ 'font-size': '14px' }}>Status: {readerStatus()}</div>
          <Show when={readerError()}>
            <div style={{ 'font-size': '14px', color: 'red' }}>
              Error: {readerError()}
            </div>
          </Show>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              style={{
                ...btnStyle,
                background: '#16a34a',
                opacity: readerStatus() === 'reading' ? 0.5 : 1,
              }}
              disabled={readerStatus() === 'reading'}
              onClick={startReading}
            >
              Start reading
            </button>
            <button
              style={{
                ...btnStyle,
                background: '#dc2626',
                opacity: readerStatus() === 'reading' ? 1 : 0.5,
              }}
              disabled={readerStatus() !== 'reading'}
              onClick={cancelReader}
            >
              Cancel
            </button>
          </div>

          <Show when={receivedLines().length > 0}>
            <div style={{ 'font-size': '14px', 'font-weight': 500 }}>
              Received ({receivedLines().length}):
            </div>
            <div
              style={{
                background: '#f3f4f6',
                padding: '8px',
                'font-family': 'monospace',
                'font-size': '12px',
                'max-height': '192px',
                'overflow-y': 'auto',
              }}
            >
              {[...receivedLines()].reverse().map((line) => (
                <div>{line}</div>
              ))}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

export default function Streams() {
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
