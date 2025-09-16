import { describe, expect, it } from 'vitest';
import { createConnectionActor } from './connectionActor.ts';
import createLogger from '../../utils/log.ts';
import type {
  Scheduler,
  WebSocketCloseEvent,
  WebSocketLike,
} from '../types.ts';

class TestScheduler implements Scheduler {
  private nextId = 1;
  readonly timers = new Map<number, () => void>();

  setTimeout(handler: () => void): number {
    const id = this.nextId++;
    this.timers.set(id, handler);
    return id;
  }

  clearTimeout(timeoutId: number): void {
    this.timers.delete(timeoutId);
  }

  run(timeoutId: number): void {
    const handler = this.timers.get(timeoutId);
    if (!handler) return;
    this.timers.delete(timeoutId);
    handler();
  }
}

class TestWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  private listeners: Record<string, Set<Function>> = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
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

  emitClose(event: WebSocketCloseEvent) {
    this.readyState = 3;
    for (const cb of this.listeners.close) cb(event);
  }

  emitError(error: unknown) {
    for (const cb of this.listeners.error) cb(error);
  }
}

describe('connection actor', () => {
  it('connects, flushes pending messages, and receives packets', async () => {
    const scheduler = new TestScheduler();
    const sockets: TestWebSocket[] = [];
    const actor = createConnectionActor({
      scheduler,
      logger: createLogger(false),
      createWebSocket: () => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    actor.send({ type: 'send', payload: 'one' });
    actor.send({ type: 'connect' });
    await actor.ask({ type: 'noop' });

    expect(sockets).toHaveLength(1);

    const socket = sockets[0];
    socket.emitOpen();
    await actor.ask({ type: 'noop' });

    expect(socket.sent).toContain('one');
    expect(actor.snapshot.pending).toHaveLength(0);

    socket.emitMessage('{"op":"noop"}');
    await actor.ask({ type: 'noop' });

    expect(actor.snapshot.inbox).toHaveLength(1);
    const [{ id }] = actor.snapshot.inbox;

    actor.send({ type: 'ack-message', packetId: id });
    await actor.ask({ type: 'noop' });
    expect(actor.snapshot.inbox).toHaveLength(0);
  });

  it('schedules reconnect after close when online', async () => {
    const scheduler = new TestScheduler();
    const sockets: TestWebSocket[] = [];
    const actor = createConnectionActor({
      scheduler,
      logger: createLogger(false),
      createWebSocket: () => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    actor.send({ type: 'connect' });
    await actor.ask({ type: 'noop' });
    const first = sockets[0];
    first.emitOpen();
    await actor.ask({ type: 'noop' });

    first.emitClose({ code: 4000, reason: 'test' });
    await actor.ask({ type: 'noop' });

    expect(actor.snapshot.status).toBe('connecting');
    expect(scheduler.timers.size).toBe(1);

    const [timerId] = scheduler.timers.keys();
    scheduler.run(timerId!);
    await actor.ask({ type: 'noop' });

    expect(sockets).toHaveLength(2);
  });

  it('does not reconnect after manual disconnect', async () => {
    const scheduler = new TestScheduler();
    const sockets: TestWebSocket[] = [];
    const actor = createConnectionActor({
      scheduler,
      logger: createLogger(false),
      createWebSocket: () => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    actor.send({ type: 'connect' });
    await actor.ask({ type: 'noop' });
    const socket = sockets[0];
    socket.emitOpen();
    await actor.ask({ type: 'noop' });
    actor.send({ type: 'disconnect' });
    await actor.ask({ type: 'noop' });

    socket.emitClose({ code: 1000, reason: 'manual' });
    await actor.ask({ type: 'noop' });

    expect(actor.snapshot.status).toBe('closed');
    expect(scheduler.timers.size).toBe(0);
  });
});
