import { describe, expect, it } from 'vitest';
import { createQueryActor, QueryError, QueryResultEnvelope } from './queryActor.ts';
import { createPersistedState } from '../storage/persistedState.ts';
import { InMemoryStorageDriver } from '../storage/inMemoryDriver.ts';
import createLogger from '../../utils/log.ts';

function createPersisted() {
  const driver = new InMemoryStorageDriver();
  return createPersistedState<Record<string, any>>({
    name: 'queries',
    namespace: 'test',
    key: 'queries',
    driver,
    initialValue: {},
  });
}

describe('query actor', () => {
  it('subscribes, caches results, and evicts when unsubscribed', async () => {
    let counter = 0;
    const persisted = createPersisted();
    const actor = createQueryActor({
      persisted,
      createEventId: () => `evt-${++counter}`,
      logger: createLogger(false),
      queryCacheLimit: 10,
    });

    const subscribeResp = await actor.ask({
      type: 'subscribe',
      payload: {
        hash: 'hash-1',
        query: { foo: 'bar' },
        subscriberId: 'sub-1',
        now: Date.now(),
      },
    });
    expect(subscribeResp.eventId).toBe('evt-1');
    expect(subscribeResp.shouldFetch).toBe(true);

    const result: QueryResultEnvelope = { store: { foo: 1 } };
    await actor.ask({
      type: 'set-result',
      hash: 'hash-1',
      result,
      now: Date.now(),
    });

    const entry = await actor.ask({ type: 'get', hash: 'hash-1' });
    expect(entry.result).toEqual(result);

    const unsubscribeResp = await actor.ask({
      type: 'unsubscribe',
      payload: { hash: 'hash-1', subscriberId: 'sub-1' },
    });
    expect(unsubscribeResp.shouldRemove).toBe(true);

    const after = await actor.ask({ type: 'get', hash: 'hash-1' });
    expect(after).toBeUndefined();
  });

  it('handles query once lifecycle', async () => {
    let counter = 0;
    const persisted = createPersisted();
    const actor = createQueryActor({
      persisted,
      createEventId: () => `evt-${++counter}`,
      logger: createLogger(false),
      queryCacheLimit: 10,
    });

    const resolved: QueryResultEnvelope[] = [];
    const errors: QueryError[] = [];

    const onceResp = await actor.ask({
      type: 'request-once',
      payload: {
        hash: 'hash-once',
        query: { foo: 'bar' },
        requestId: 'req-1',
        now: Date.now(),
        resolve: (data) => resolved.push(data),
        reject: (err) => errors.push(err),
      },
    });

    expect(onceResp.eventId).toBe('evt-2');

    const data: QueryResultEnvelope = { store: { foo: 2 } };
    actor.send({
      type: 'resolve-once',
      hash: 'hash-once',
      eventId: onceResp.eventId,
      result: data,
    });

    await actor.ask({ type: 'noop' });
    expect(resolved).toEqual([data]);
    expect(errors).toHaveLength(0);

    const secondResp = await actor.ask({
      type: 'request-once',
      payload: {
        hash: 'hash-once',
        query: { foo: 'bar' },
        requestId: 'req-2',
        now: Date.now(),
        resolve: (data) => resolved.push(data),
        reject: (err) => errors.push(err),
      },
    });

    const err: QueryError = { message: 'boom' };
    actor.send({
      type: 'reject-once',
      hash: 'hash-once',
      eventId: secondResp.eventId,
      error: err,
    });

    await actor.ask({ type: 'noop' });
    expect(errors).toEqual([err]);
  });
});
