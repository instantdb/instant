import { describe, expect, it } from 'vitest';
import { ReactorSystem } from './ReactorSystem.ts';
import weakHash from '../utils/weakHash.ts';
import createLogger from '../utils/log.ts';
import type { Scheduler, WebSocketLike } from './types.ts';

class TestScheduler implements Scheduler {
  private nextId = 1;
  readonly timers = new Map<number, () => void>();

  setTimeout(handler: () => void, _ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, handler);
    return id;
  }

  clearTimeout(timeoutId: number): void {
    this.timers.delete(timeoutId);
  }

  run(timerId: number) {
    const handler = this.timers.get(timerId);
    if (!handler) return;
    this.timers.delete(timerId);
    handler();
  }
}

class TestWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  listeners: Record<string, Set<Function>> = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  addEventListener(event: 'open' | 'message' | 'close' | 'error', cb: any): void {
    this.listeners[event].add(cb);
  }

  removeEventListener(event: 'open' | 'message' | 'close' | 'error', cb: any): void {
    this.listeners[event].delete(cb);
  }

  emitOpen() {
    this.readyState = 1;
    for (const cb of this.listeners.open) cb();
  }

  emitMessage(payload: string) {
    for (const cb of this.listeners.message) cb({ data: payload });
  }

  emitClose() {
    this.readyState = 3;
    for (const cb of this.listeners.close) cb({});
  }
}

describe('ReactorSystem integration', () => {
  it('handles queries, mutations, and presence', async () => {
    const scheduler = new TestScheduler();
    const sockets: TestWebSocket[] = [];
    const logger = createLogger(false);

    const system = new ReactorSystem({
      scheduler,
      logger,
      createWebSocket: () => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    system.start();
    await system.flush();
    expect(sockets).toHaveLength(1);
    const socket = sockets[0];
    socket.emitOpen();
    await system.flush();

    const receivedResults: any[] = [];
    const query = { $: 'items.all' };
    system.subscribeQuery(query, (result) => {
      if (result) receivedResults.push(result);
    });
    await system.flush();

    const addQueryMessage = socket.sent.find((msg) => JSON.parse(msg).type === 'add-query');
    expect(addQueryMessage).toBeTruthy();

    const hash = weakHash(query);
    system.receiveMessage(
      JSON.stringify({
        type: 'query-result',
        hash,
        result: { store: { items: [{ id: 1 }] } },
      }),
    );
    await system.flush();
    expect(receivedResults).toEqual([{ store: { items: [{ id: 1 }] } }]);

    const txPromise = system.transact([{ op: 'noop' }]);
    await system.flush();
    const transactMsg = socket.sent.find((msg) => JSON.parse(msg).type === 'transact');
    expect(transactMsg).toBeTruthy();
    const { eventId } = JSON.parse(transactMsg!);

    system.receiveMessage(
      JSON.stringify({ type: 'mutation-ack', eventId, txId: 99 }),
    );
    await system.flush();
    await expect(txPromise).resolves.toEqual({ eventId, txId: 99 });

    const presenceUpdates: Record<string, unknown>[] = [];
    system.onPresence('room1', (peers) => presenceUpdates.push(peers));
    await system.flush();

    const joinMsg = socket.sent.find((msg) => JSON.parse(msg).type === 'join-room');
    expect(joinMsg).toBeTruthy();

    system.setLocalPresence('room1', { state: 'online' });
    await system.flush();

    system.receiveMessage(JSON.stringify({ type: 'room-joined', roomId: 'room1' }));
    await system.flush();

    const setPresenceMsg = socket.sent.find((msg) => JSON.parse(msg).type === 'set-presence');
    expect(setPresenceMsg).toBeTruthy();

    system.receiveMessage(
      JSON.stringify({
        type: 'presence-update',
        roomId: 'room1',
        peers: { user: { state: 'online' } },
      }),
    );
    await system.flush();
    expect(presenceUpdates).toEqual([{ user: { state: 'online' } }]);
  });

  it('supports query once and broadcast flows', async () => {
    const scheduler = new TestScheduler();
    const sockets: TestWebSocket[] = [];
    const system = new ReactorSystem({
      scheduler,
      createWebSocket: () => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        return socket;
      },
      logger: createLogger(false),
    });

    system.start();
    await system.flush();
    const socket = sockets[0];
    socket.emitOpen();
    await system.flush();

    const oncePromise = system.queryOnce({ $: 'items.first' });
    await system.flush();
    const addOnceMsg = socket.sent.find((msg) => {
      const parsed = JSON.parse(msg);
      return parsed.type === 'add-query' && parsed.once;
    });
    expect(addOnceMsg).toBeTruthy();
    const onceParsed = JSON.parse(addOnceMsg!);

    const hash = weakHash({ $: 'items.first' });
    system.receiveMessage(
      JSON.stringify({
        type: 'query-result',
        hash,
        onceEventId: onceParsed.eventId,
        result: { store: { item: { id: 42 } } },
      }),
    );
    await system.flush();
    await expect(oncePromise).resolves.toEqual({ store: { item: { id: 42 } } });

    const receivedBroadcasts: unknown[] = [];
    system.onBroadcast('room2', 'chat', (payload) => receivedBroadcasts.push(payload));
    await system.flush();

    system.broadcast('room2', 'chat', { text: 'queued' });
    await system.flush();

    socket.emitOpen();
    system.receiveMessage(JSON.stringify({ type: 'room-joined', roomId: 'room2' }));
    await system.flush();

    const broadcastMsg = socket.sent.find((msg) => JSON.parse(msg).type === 'broadcast');
    expect(broadcastMsg).toBeTruthy();

    system.receiveMessage(
      JSON.stringify({
        type: 'server-broadcast',
        roomId: 'room2',
        topic: 'chat',
        payload: { text: 'hello' },
      }),
    );
    await system.flush();
    expect(receivedBroadcasts).toEqual([{ text: 'hello' }]);
  });
});
