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

test(
  'write and read a stream end-to-end',
  { timeout: 30000 },
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
);

test(
  'streamId() returns a valid stream ID',
  { timeout: 30000 },
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
);

test(
  'read stream by streamId',
  { timeout: 30000 },
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
);

test(
  'multiple writes produce concatenated output',
  { timeout: 30000 },
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
);

test(
  'reader can cancel mid-stream',
  { timeout: 30000 },
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
);

test(
  'independent streams do not interfere',
  { timeout: 30000 },
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
    const dataA = await readAll(
      db.streams.createReadStream({ clientId: clientA }),
    );
    const dataB = await readAll(
      db.streams.createReadStream({ clientId: clientB }),
    );

    expect(dataA).toContain('stream-A-data');
    expect(dataB).toContain('stream-B-data');
    // Verify no cross-contamination
    expect(dataA).not.toContain('stream-B-data');
    expect(dataB).not.toContain('stream-A-data');
  },
);

test(
  'write large data and read it back',
  { timeout: 30000 },
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
);

test(
  'write stream with waitUntil completes properly',
  { timeout: 30000 },
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
);
