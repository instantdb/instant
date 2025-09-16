import { describe, expect, it } from 'vitest';
import { createMutationActor } from './mutationActor.ts';
import { createPersistedState } from '../storage/persistedState.ts';
import { InMemoryStorageDriver } from '../storage/inMemoryDriver.ts';
import createLogger from '../../utils/log.ts';
import type { Scheduler } from '../types.ts';

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

  flush(timeoutId: number) {
    const handler = this.timers.get(timeoutId);
    if (!handler) return;
    this.timers.delete(timeoutId);
    handler();
  }
}

describe('mutation actor', () => {
  it('enqueues, marks as sent, and acknowledges mutations', async () => {
    const scheduler = new TestScheduler();
    const persisted = createPersistedState<Record<string, any>>({
      name: 'mutations',
      namespace: 'test',
      key: 'mutations',
      driver: new InMemoryStorageDriver(),
      initialValue: {},
    });

    const actor = createMutationActor({
      persisted,
      scheduler,
      logger: createLogger(false),
      defaultTimeoutMs: 1000,
    });

    await actor.ask({ type: 'enqueue', payload: { eventId: 'evt-1', steps: [], enqueuedAt: 0 } });
    const pending = await actor.ask({ type: 'list-pending' });
    expect(pending).toHaveLength(1);

    await actor.ask({ type: 'mark-sent', eventId: 'evt-1', now: 10 });
    expect(scheduler.timers.size).toBe(1);
    const [timerId] = scheduler.timers.keys();

    await actor.ask({ type: 'ack', eventId: 'evt-1', txId: 1, now: 20 });
    expect(scheduler.timers.size).toBe(0);

    const notifications = await actor.ask({ type: 'drain-notifications' });
    expect(notifications).toEqual([{ type: 'ack', eventId: 'evt-1', txId: 1 }]);

    scheduler.flush(timerId!);
    const notificationsAfter = await actor.ask({ type: 'drain-notifications' });
    expect(notificationsAfter).toHaveLength(0);
  });

  it('handles timeouts and failures', async () => {
    const scheduler = new TestScheduler();
    const actor = createMutationActor({
      persisted: createPersistedState({
        name: 'mut',
        namespace: 'test',
        key: 'mut',
        driver: new InMemoryStorageDriver(),
        initialValue: {},
      }),
      scheduler,
      logger: createLogger(false),
      defaultTimeoutMs: 10,
    });

    await actor.ask({ type: 'enqueue', payload: { eventId: 'evt-1', steps: [], enqueuedAt: 0 } });
    await actor.ask({ type: 'mark-sent', eventId: 'evt-1', now: 5, timeoutMs: 20 });

    const [timerId] = scheduler.timers.keys();
    scheduler.flush(timerId!);

    const timeoutNotifications = await actor.ask({ type: 'drain-notifications' });
    expect(timeoutNotifications).toEqual([{ type: 'timeout', eventId: 'evt-1' }]);

    await actor.ask({
      type: 'fail',
      eventId: 'evt-1',
      error: { message: 'oops' },
    });

    const failNotifications = await actor.ask({ type: 'drain-notifications' });
    expect(failNotifications).toEqual([
      { type: 'error', eventId: 'evt-1', error: { message: 'oops' } },
    ]);

    const pending = await actor.ask({ type: 'list-pending' });
    expect(pending).toHaveLength(0);
  });
});
