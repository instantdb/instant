/** Stream smoke tests. */
import { describe, it, expect } from '../framework.js';
import {
  connectWS, wsInit, wsSend, wsWaitFor, TestApp, uuid, sleep,
} from '../helpers.js';

export async function streamTests(app: TestApp) {
  await describe('Streams', async () => {
    await it('start-stream: creates stream with ID', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eventId = uuid();
      wsSend(ws, {
        op: 'start-stream',
        'client-id': 'my-stream-1',
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      expect(msg['stream-id']).toBeDefined();
      expect(msg['client-id']).toBe('my-stream-1');
      expect(msg.offset).toBeDefined();
      ws.close();
    });

    await it('append-stream: writes data chunks', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Start stream
      wsSend(ws, {
        op: 'start-stream',
        'client-id': 'append-stream-1',
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      const streamId = start['stream-id'];

      // Append chunks
      const eventId = uuid();
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['Hello ', 'World'],
        'done?': false,
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(msg['stream-id']).toBe(streamId);
      expect(msg.offset).toBeGreaterThan(0);
      expect(msg.done).toBe(false);
      ws.close();
    });

    await it('append-stream: close stream', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'start-stream',
        'client-id': 'close-stream-1',
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['final data'],
        'done?': true,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('subscribe-stream: reads data by client-id', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Create and write stream
      const clientId = `read-cid-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['test data for reading'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Subscribe to read by client-id
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('test data for reading');
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('subscribe-stream: reads data by stream-id', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `read-sid-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      const streamId = start['stream-id'];

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['stream-id read test'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Subscribe by stream-id instead of client-id
      wsSend(ws, {
        op: 'subscribe-stream',
        'stream-id': streamId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('stream-id read test');
      expect(msg['stream-id']).toBe(streamId);
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('subscribe-stream: multiple sequential appends', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `multi-append-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      const streamId = start['stream-id'];

      // Append chunk 1
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['chunk-1\n'],
        'done?': false,
        'client-event-id': uuid(),
      });
      const flush1 = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(flush1.done).toBe(false);

      // Append chunk 2
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['chunk-2\n'],
        'done?': false,
        'client-event-id': uuid(),
      });
      const flush2 = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(flush2.offset).toBeGreaterThan(flush1.offset);

      // Append chunk 3 and close
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['chunk-3\n'],
        'done?': true,
        'client-event-id': uuid(),
      });
      const flush3 = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(flush3.done).toBe(true);
      expect(flush3.offset).toBeGreaterThan(flush2.offset);

      // Read all data
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('chunk-1');
      expect(msg.data).toContain('chunk-2');
      expect(msg.data).toContain('chunk-3');
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('subscribe-stream: with offset skips earlier data', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `offset-read-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      const streamId = start['stream-id'];

      // Write known data: "AAAABBBB"
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['AAAA'],
        'done?': false,
        'client-event-id': uuid(),
      });
      const flush1 = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['BBBB'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Subscribe with offset = flush1.offset to skip "AAAA"
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: flush1.offset,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      // Should only contain the second chunk
      expect(msg.data).toContain('BBBB');
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('subscribe-stream: multiple subscribers on same stream', async () => {
      const ws1 = await connectWS(app.id);
      await wsInit(ws1, app);

      const clientId = `multi-sub-${uuid()}`;
      wsSend(ws1, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws1, (m) => m.op === 'start-stream-ok');

      wsSend(ws1, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['shared data'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws1, (m) => m.op === 'stream-flushed');

      // Subscriber 1
      const sub1EventId = uuid();
      wsSend(ws1, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': sub1EventId,
      });

      const msg1 = await wsWaitFor(ws1, (m) =>
        m.op === 'stream-append' && m['client-event-id'] === sub1EventId
      );
      expect(msg1.data).toContain('shared data');

      // Subscriber 2 on a different connection
      const ws2 = await connectWS(app.id);
      await wsInit(ws2, app);

      const sub2EventId = uuid();
      wsSend(ws2, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': sub2EventId,
      });

      const msg2 = await wsWaitFor(ws2, (m) =>
        m.op === 'stream-append' && m['client-event-id'] === sub2EventId
      );
      expect(msg2.data).toContain('shared data');
      expect(msg2.done).toBe(true);

      ws1.close();
      ws2.close();
    });

    await it('subscribe-stream: writer and reader on separate connections', async () => {
      // Writer connection
      const wsWriter = await connectWS(app.id);
      await wsInit(wsWriter, app);

      const clientId = `cross-conn-${uuid()}`;
      wsSend(wsWriter, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(wsWriter, (m) => m.op === 'start-stream-ok');

      wsSend(wsWriter, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['cross-connection data'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(wsWriter, (m) => m.op === 'stream-flushed');

      // Reader on a separate connection
      const wsReader = await connectWS(app.id);
      await wsInit(wsReader, app);

      wsSend(wsReader, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(wsReader, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('cross-connection data');
      expect(msg.done).toBe(true);

      wsWriter.close();
      wsReader.close();
    });

    await it('start-stream: reconnect-token resumes same stream', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `reconnect-${uuid()}`;
      const reconnectToken = uuid();

      // Start stream with reconnect token
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'reconnect-token': reconnectToken,
        'client-event-id': uuid(),
      });
      const start1 = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      const streamId = start1['stream-id'];

      // Write some data
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': streamId,
        chunks: ['before-reconnect'],
        'done?': false,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Reconnect with the same token
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'reconnect-token': reconnectToken,
        'client-event-id': uuid(),
      });
      const start2 = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Should get back the same stream with a non-zero offset
      expect(start2['stream-id']).toBeDefined();
      expect(start2.offset).toBeGreaterThan(0);

      // Write more data after reconnect
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start2['stream-id'],
        chunks: ['after-reconnect'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Read should have all data
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('before-reconnect');
      expect(msg.data).toContain('after-reconnect');
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('append-stream: large data chunks', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `large-data-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Write a 100KB chunk
      const largeChunk = 'X'.repeat(100 * 1024);
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: [largeChunk],
        'done?': true,
        'client-event-id': uuid(),
      });

      const flush = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(flush.done).toBe(true);
      expect(flush.offset).toBeGreaterThanOrEqual(100 * 1024);

      // Verify we can read it back
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data.length).toBeGreaterThanOrEqual(100 * 1024);
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('independent streams do not interfere', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Create stream A
      const clientIdA = `stream-a-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientIdA,
        'client-event-id': uuid(),
      });
      const startA = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Create stream B
      const clientIdB = `stream-b-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientIdB,
        'client-event-id': uuid(),
      });
      const startB = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Write different data to each
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': startA['stream-id'],
        chunks: ['data-for-A'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed' && m['stream-id'] === startA['stream-id']);

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': startB['stream-id'],
        chunks: ['data-for-B'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed' && m['stream-id'] === startB['stream-id']);

      // Read stream A
      const subAEventId = uuid();
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientIdA,
        offset: 0,
        'client-event-id': subAEventId,
      });
      const msgA = await wsWaitFor(ws, (m) =>
        m.op === 'stream-append' && m['client-event-id'] === subAEventId
      );
      expect(msgA.data).toContain('data-for-A');

      // Read stream B
      const subBEventId = uuid();
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientIdB,
        offset: 0,
        'client-event-id': subBEventId,
      });
      const msgB = await wsWaitFor(ws, (m) =>
        m.op === 'stream-append' && m['client-event-id'] === subBEventId
      );
      expect(msgB.data).toContain('data-for-B');

      ws.close();
    });

    await it('subscribe-stream: response includes stream-id and client-id', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `meta-check-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['metadata test'],
        'done?': true,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      const eventId = uuid();
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) =>
        m.op === 'stream-append' && m['client-event-id'] === eventId
      );
      // Verify response metadata
      expect(msg['stream-id']).toBe(start['stream-id']);
      expect(msg['client-id']).toBe(clientId);
      expect(msg['client-event-id']).toBe(eventId);
      expect(msg.offset).toBeGreaterThan(0);
      expect(msg.done).toBe(true);
      ws.close();
    });

    await it('append-stream: multiple chunks in single append', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `multi-chunk-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Send multiple chunks in a single append
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['first,', 'second,', 'third'],
        'done?': true,
        'client-event-id': uuid(),
      });

      const flush = await wsWaitFor(ws, (m) => m.op === 'stream-flushed');
      expect(flush.done).toBe(true);

      // Read back
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('first,');
      expect(msg.data).toContain('second,');
      expect(msg.data).toContain('third');
      ws.close();
    });

    await it('start-stream: offset starts at zero for new stream', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'start-stream',
        'client-id': `zero-offset-${uuid()}`,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');
      expect(msg.offset).toBe(0);
      ws.close();
    });

    await it('append-stream: close with empty chunks', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const clientId = `empty-close-${uuid()}`;
      wsSend(ws, {
        op: 'start-stream',
        'client-id': clientId,
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-stream-ok');

      // Write some data first
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: ['some data'],
        'done?': false,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'stream-flushed');

      // Close with empty chunks array
      wsSend(ws, {
        op: 'append-stream',
        'stream-id': start['stream-id'],
        chunks: [],
        'done?': true,
        'client-event-id': uuid(),
      });

      const flush = await wsWaitFor(ws, (m) => m.op === 'stream-flushed' && m.done === true);
      expect(flush.done).toBe(true);

      // Read back and verify data is there and stream is done
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': clientId,
        offset: 0,
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('some data');
      expect(msg.done).toBe(true);
      ws.close();
    });
  });
}
