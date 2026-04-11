/** Sync table smoke tests. */
import { describe, it, expect } from '../framework.js';
import {
  post, adminHeaders, connectWS, wsInit, wsSend, wsWaitFor,
  TestApp, uuid, sleep,
} from '../helpers.js';

export async function syncTests(app: TestApp) {
  await describe('Sync Tables', async () => {
    await it('start-sync: creates subscription', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eventId = uuid();
      wsSend(ws, {
        op: 'start-sync',
        q: { todos: {} },
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'start-sync-ok');
      expect(msg['subscription-id']).toBeDefined();
      ws.close();
    });

    await it('refresh-sync-table: returns changes', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Start sync
      wsSend(ws, {
        op: 'start-sync',
        q: { todos: {} },
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-sync-ok');

      // Make a change via transact
      const eid = uuid();
      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      wsSend(ws, {
        op: 'transact',
        'tx-steps': [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, 'sync test'],
        ],
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'transact-ok');

      // Refresh sync table
      const eventId = uuid();
      wsSend(ws, {
        op: 'refresh-sync-table',
        'subscription-id': start['subscription-id'],
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'sync-update-triples');
      expect(msg['subscription-id']).toBe(start['subscription-id']);
      expect(msg.txes).toBeDefined();
      ws.close();
    });

    await it('remove-sync: deletes subscription', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'start-sync',
        q: { todos: {} },
        'client-event-id': uuid(),
      });
      const start = await wsWaitFor(ws, (m) => m.op === 'start-sync-ok');

      const eventId = uuid();
      wsSend(ws, {
        op: 'remove-sync',
        'subscription-id': start['subscription-id'],
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'remove-sync-ok');
      expect(msg.op).toBe('remove-sync-ok');
      ws.close();
    });
  });
}
