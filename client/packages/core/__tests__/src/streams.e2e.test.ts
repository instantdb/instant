import { expect } from 'vitest';
import { i } from '../../src';
import { makeE2ETest, apiUrl } from './utils/e2e';

const schema = i.schema({
  entities: {},
});

const test = makeE2ETest({
  schema,
  rules: {
    code: {
      $streams: {
        allow: {
          create: 'true',
          view: 'true',
        },
      },
    },
  },
});

function randomId() {
  return crypto.randomUUID();
}

/** Collect all chunks from a ReadableStream into a single string. */
async function readAll(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let result = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) result += value;
  }
  return result;
}

/** Read up to `n` chunks from a ReadableStream, return concatenated string. */
async function readChunks(
  stream: ReadableStream<string>,
  n: number,
): Promise<{ data: string; reader: ReadableStreamDefaultReader<string> }> {
  const reader = stream.getReader();
  let result = '';
  for (let i = 0; i < n; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) result += value;
  }
  return { data: result, reader };
}

test(
  'write and read a stream end-to-end',
  async ({ db }) => {
    const clientId = randomId();

    // Write stream
    const writeStream = db.streams.createWriteStream({ clientId });
    const writer = writeStream.getWriter();
    await writer.write('Hello ');
    await writer.write('World');
    await writer.close();

    // Read stream
    const readStream = db.streams.createReadStream({ clientId });
    const data = await readAll(readStream);

    expect(data).toContain('Hello ');
    expect(data).toContain('World');
  },
  { timeout: 30000 },
);

test(
  'streamId() returns a valid stream ID',
  async ({ db }) => {
    const clientId = randomId();

    const writeStream = db.streams.createWriteStream({ clientId });
    const streamId = await writeStream.streamId();

    expect(streamId).toBeDefined();
    expect(typeof streamId).toBe('string');
    expect(streamId.length).toBeGreaterThan(0);

    // Clean up
    const writer = writeStream.getWriter();
    await writer.close();
  },
  { timeout: 30000 },
);

test(
  'read stream by streamId',
  async ({ db }) => {
    const clientId = randomId();

    const writeStream = db.streams.createWriteStream({ clientId });
    const streamId = await writeStream.streamId();
    const writer = writeStream.getWriter();
    await writer.write('by-stream-id');
    await writer.close();

    // Read using streamId instead of clientId
    const readStream = db.streams.createReadStream({ streamId });
    const data = await readAll(readStream);

    expect(data).toContain('by-stream-id');
  },
  { timeout: 30000 },
);

test(
  'multiple writes produce concatenated output',
  async ({ db }) => {
    const clientId = randomId();

    const writeStream = db.streams.createWriteStream({ clientId });
    const writer = writeStream.getWriter();
    await writer.write('line1\n');
    await writer.write('line2\n');
    await writer.write('line3\n');
    await writer.close();

    const readStream = db.streams.createReadStream({ clientId });
    const data = await readAll(readStream);

    expect(data).toContain('line1\n');
    expect(data).toContain('line2\n');
    expect(data).toContain('line3\n');
  },
  { timeout: 30000 },
);

test(
  'reader can cancel mid-stream',
  async ({ db }) => {
    const clientId = randomId();

    const writeStream = db.streams.createWriteStream({ clientId });
    const writer = writeStream.getWriter();
    await writer.write('chunk1\n');
    await writer.write('chunk2\n');

    // Start reading
    const readStream = db.streams.createReadStream({ clientId });
    const reader = readStream.getReader();

    // Read at least one chunk
    const { value } = await reader.read();
    expect(value).toBeDefined();

    // Cancel the reader
    await reader.cancel('test cancellation');

    // Writer should still be able to close
    await writer.close();
  },
  { timeout: 30000 },
);

test(
  'independent streams do not interfere',
  async ({ db }) => {
    const clientA = randomId();
    const clientB = randomId();

    // Write to stream A
    const wsA = db.streams.createWriteStream({ clientId: clientA });
    const writerA = wsA.getWriter();
    await writerA.write('stream-A-data');
    await writerA.close();

    // Write to stream B
    const wsB = db.streams.createWriteStream({ clientId: clientB });
    const writerB = wsB.getWriter();
    await writerB.write('stream-B-data');
    await writerB.close();

    // Read each independently
    const dataA = await readAll(db.streams.createReadStream({ clientId: clientA }));
    const dataB = await readAll(db.streams.createReadStream({ clientId: clientB }));

    expect(dataA).toContain('stream-A-data');
    expect(dataB).toContain('stream-B-data');
    // Verify no cross-contamination
    expect(dataA).not.toContain('stream-B-data');
    expect(dataB).not.toContain('stream-A-data');
  },
  { timeout: 30000 },
);

test(
  'write large data and read it back',
  async ({ db }) => {
    const clientId = randomId();

    const writeStream = db.streams.createWriteStream({ clientId });
    const writer = writeStream.getWriter();

    // Write 50KB of data
    const largeChunk = 'X'.repeat(50 * 1024) + '\n';
    await writer.write(largeChunk);
    await writer.close();

    const readStream = db.streams.createReadStream({ clientId });
    const data = await readAll(readStream);

    expect(data.length).toBeGreaterThanOrEqual(50 * 1024);
  },
  { timeout: 30000 },
);

test(
  'write stream with waitUntil completes properly',
  async ({ db }) => {
    const clientId = randomId();
    let waitUntilResolved = false;

    const writeStream = db.streams.createWriteStream({
      clientId,
      waitUntil: (p: Promise<any>) => {
        p.then(() => {
          waitUntilResolved = true;
        });
      },
    });

    const writer = writeStream.getWriter();
    await writer.write('data with waitUntil\n');
    await writer.close();

    // Give a short window for the waitUntil promise to resolve
    await new Promise((r) => setTimeout(r, 2000));

    expect(waitUntilResolved).toBe(true);
  },
  { timeout: 30000 },
);
