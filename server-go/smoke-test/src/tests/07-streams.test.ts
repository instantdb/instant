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

    await it('subscribe-stream: reads data', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Create and write stream
      wsSend(ws, {
        op: 'start-stream',
        'client-id': 'read-stream-1',
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

      // Subscribe to read
      const eventId = uuid();
      wsSend(ws, {
        op: 'subscribe-stream',
        'client-id': 'read-stream-1',
        offset: 0,
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'stream-append');
      expect(msg.data).toContain('test data for reading');
      expect(msg.done).toBe(true);
      ws.close();
    });
  });
}
