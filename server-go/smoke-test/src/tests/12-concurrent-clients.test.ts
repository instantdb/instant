/** Concurrent clients smoke test — 100 simultaneous WebSocket connections. */
import { describe, it, expect } from '../framework.js';
import {
  connectWS, wsInit, wsSend, wsWaitFor, TestApp, uuid, sleep,
} from '../helpers.js';
import WebSocket from 'ws';

/** Connect and initialize a WS client, returning the socket. */
async function initClient(app: TestApp): Promise<WebSocket> {
  const ws = await connectWS(app.id);
  await wsInit(ws, app);
  return ws;
}

/** Collect all messages matching a predicate until count is reached or timeout. */
function wsCollect(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  count: number,
  timeoutMs = 30000,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const collected: any[] = [];
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(
        new Error(
          `wsCollect timeout: expected ${count} messages, got ${collected.length}`,
        ),
      );
    }, timeoutMs);

    function handler(data: WebSocket.Data) {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        collected.push(msg);
        if (collected.length >= count) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          resolve(collected);
        }
      }
    }
    ws.on('message', handler);
  });
}

const NUM_CLIENTS = 100;

export async function concurrentClientTests(app: TestApp) {
  await describe('Concurrent Clients (100)', async () => {

    await it('100 clients connect and init simultaneously', async () => {
      // Launch all connections in parallel
      const clients = await Promise.all(
        Array.from({ length: NUM_CLIENTS }, () => initClient(app)),
      );

      expect(clients.length).toBe(NUM_CLIENTS);

      // Verify all sockets are open
      for (const ws of clients) {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      }

      for (const ws of clients) ws.close();
    });

    await it('100 clients subscribe to a shared query and receive updates from a writer', async () => {
      const clients = await Promise.all(
        Array.from({ length: NUM_CLIENTS }, () => initClient(app)),
      );

      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      const doneAttr = app.attrs['todos.done'];

      // All clients subscribe to todos
      const subEventIds = clients.map(() => uuid());
      for (let i = 0; i < clients.length; i++) {
        wsSend(clients[i], {
          op: 'add-query',
          q: { todos: {} },
          'client-event-id': subEventIds[i],
        });
      }

      // Wait for initial subscription results
      await Promise.all(
        clients.map((ws: WebSocket, i: number) =>
          wsWaitFor(
            ws,
            (m) => m.op === 'add-query-ok' && m['client-event-id'] === subEventIds[i],
          ),
        ),
      );

      // Pick client 0 as the writer — create a new todo
      const todoId = uuid();
      const txEventId = uuid();
      wsSend(clients[0], {
        op: 'transact',
        'tx-steps': [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, 'concurrent-test'],
          ['add-triple', todoId, doneAttr.id, false],
        ],
        'client-event-id': txEventId,
      });

      // Writer gets transact-ok
      await wsWaitFor(clients[0], (m) =>
        m.op === 'transact-ok' && m['client-event-id'] === txEventId,
      );

      // All other clients (1..99) should receive an add-query-ok update
      // containing the new todo via their subscription
      const updatePromises = clients.slice(1).map((ws: WebSocket) =>
        wsWaitFor(
          ws,
          (m) => {
            if (m.op !== 'add-query-ok') return false;
            // Check that the result contains our new todo
            const json = JSON.stringify(m.result || []);
            return json.includes('concurrent-test');
          },
          30000,
        ),
      );

      const updates = await Promise.all(updatePromises);
      expect(updates.length).toBe(NUM_CLIENTS - 1);

      for (const ws of clients) ws.close();
    }, 60000);

    await it('100 clients each write a todo and all see all 100 todos', async () => {
      const clients = await Promise.all(
        Array.from({ length: NUM_CLIENTS }, () => initClient(app)),
      );

      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];

      // Use a unique tag so we can filter to just this test's data
      const tag = uuid().slice(0, 8);

      // All clients subscribe to todos filtered by our tag prefix
      const subEventIds = clients.map(() => uuid());
      for (let i = 0; i < clients.length; i++) {
        wsSend(clients[i], {
          op: 'add-query',
          q: { todos: {} },
          'client-event-id': subEventIds[i],
        });
      }
      await Promise.all(
        clients.map((ws: WebSocket, i: number) =>
          wsWaitFor(
            ws,
            (m) => m.op === 'add-query-ok' && m['client-event-id'] === subEventIds[i],
          ),
        ),
      );

      // Each client writes one todo — fire all transacts in parallel
      const todoIds: string[] = [];
      const txEventIds: string[] = [];
      for (let i = 0; i < NUM_CLIENTS; i++) {
        const todoId = uuid();
        const txEventId = uuid();
        todoIds.push(todoId);
        txEventIds.push(txEventId);

        wsSend(clients[i], {
          op: 'transact',
          'tx-steps': [
            ['add-triple', todoId, idAttr.id, todoId],
            ['add-triple', todoId, textAttr.id, `${tag}-client-${i}`],
          ],
          'client-event-id': txEventId,
        });
      }

      // Wait for all transact-ok responses
      await Promise.all(
        clients.map((ws: WebSocket, i: number) =>
          wsWaitFor(ws, (m) =>
            m.op === 'transact-ok' && m['client-event-id'] === txEventIds[i],
          ),
        ),
      );

      // Give the invalidator time to propagate all updates
      await sleep(3000);

      // Verify via a fresh query on client 0 that all 100 todos exist
      const verifyEventId = uuid();
      // Remove old subscription and re-query for fresh results
      wsSend(clients[0], {
        op: 'add-query',
        q: { todos: {} },
        'client-event-id': verifyEventId,
      });
      const result = await wsWaitFor(
        clients[0],
        (m) => m.op === 'add-query-ok' && m['client-event-id'] === verifyEventId,
        15000,
      );

      // The result is an InstaQL tree (array of nodes with join-rows of triples).
      // Stringify and count occurrences of our tagged text values.
      const json = JSON.stringify(result.result || []);
      let matchCount = 0;
      for (let i = 0; i < NUM_CLIENTS; i++) {
        if (json.includes(`${tag}-client-${i}`)) {
          matchCount++;
        }
      }
      expect(matchCount).toBe(NUM_CLIENTS);

      for (const ws of clients) ws.close();
    }, 90000);

    await it('100 clients in a room exchange broadcasts', async () => {
      const clients = await Promise.all(
        Array.from({ length: NUM_CLIENTS }, () => initClient(app)),
      );

      const roomId = `concurrent-room-${uuid().slice(0, 8)}`;

      // All clients join the same room
      const joinEventIds = clients.map(() => uuid());
      for (let i = 0; i < clients.length; i++) {
        wsSend(clients[i], {
          op: 'join-room',
          'room-id': roomId,
          'peer-id': `peer-${i}`,
          'client-event-id': joinEventIds[i],
        });
      }
      await Promise.all(
        clients.map((ws: WebSocket, i: number) =>
          wsWaitFor(ws, (m) =>
            m.op === 'join-room-ok' && m['client-event-id'] === joinEventIds[i],
          ),
        ),
      );

      // Client 0 broadcasts a message
      wsSend(clients[0], {
        op: 'client-broadcast',
        'room-id': roomId,
        topic: 'ping',
        data: { msg: 'hello-from-0' },
        'peer-id': 'peer-0',
        'client-event-id': uuid(),
      });

      // All other clients should receive the broadcast
      const broadcastPromises = clients.slice(1).map((ws: WebSocket) =>
        wsWaitFor(
          ws,
          (m) =>
            m.op === 'server-broadcast' &&
            m.topic === 'ping' &&
            m.data?.data?.msg === 'hello-from-0',
          15000,
        ),
      );

      const received = await Promise.all(broadcastPromises);
      expect(received.length).toBe(NUM_CLIENTS - 1);

      // Verify sender info is present
      for (const msg of received) {
        expect(msg.data['peer-id']).toBe('peer-0');
      }

      for (const ws of clients) ws.close();
    }, 60000);

    await it('100 clients each broadcast and every client receives all 99 peer messages', async () => {
      const clients = await Promise.all(
        Array.from({ length: NUM_CLIENTS }, () => initClient(app)),
      );

      const roomId = `all-broadcast-${uuid().slice(0, 8)}`;

      // All join
      const joinIds = clients.map(() => uuid());
      for (let i = 0; i < clients.length; i++) {
        wsSend(clients[i], {
          op: 'join-room',
          'room-id': roomId,
          'peer-id': `p-${i}`,
          'client-event-id': joinIds[i],
        });
      }
      await Promise.all(
        clients.map((ws: WebSocket, i: number) =>
          wsWaitFor(ws, (m) =>
            m.op === 'join-room-ok' && m['client-event-id'] === joinIds[i],
          ),
        ),
      );

      // Set up collectors BEFORE sending broadcasts so we don't miss any
      const collectors = clients.map((ws: WebSocket) =>
        wsCollect(
          ws,
          (m) => m.op === 'server-broadcast' && m.topic === 'mass-ping',
          NUM_CLIENTS - 1,
          30000,
        ),
      );

      // Every client broadcasts
      for (let i = 0; i < NUM_CLIENTS; i++) {
        wsSend(clients[i], {
          op: 'client-broadcast',
          'room-id': roomId,
          topic: 'mass-ping',
          data: { from: i },
          'peer-id': `p-${i}`,
          'client-event-id': uuid(),
        });
      }

      // Each client should receive exactly 99 messages (from every other client)
      const allCollected = await Promise.all(collectors);
      for (let i = 0; i < NUM_CLIENTS; i++) {
        expect(allCollected[i].length).toBe(NUM_CLIENTS - 1);
      }

      for (const ws of clients) ws.close();
    }, 90000);
  });
}
