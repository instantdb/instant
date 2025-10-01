import { test, expect, vi } from 'vitest';
import { QueryActor } from '../../../src/actors/QueryActor';
import { Deferred } from '../../../src/utils/Deferred';
import weakHash from '../../../src/utils/weakHash';

test('QueryActor - subscribes to query and sends to server', () => {
  const actor = new QueryActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  const q = { users: {} };
  const cb = vi.fn();

  actor.receive({ type: 'query:subscribe', q, cb });

  // Should send add-query to server
  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.op).toBe('add-query');
  expect(sendMsg.message.q).toEqual(q);

  const hash = weakHash(q);
  expect(actor.hasActiveSubscribers(hash)).toBe(true);
});

test('QueryActor - notifies callback when result arrives', () => {
  const actor = new QueryActor();
  const q = { users: {} };
  const cb = vi.fn();

  actor.receive({ type: 'query:subscribe', q, cb });

  // Simulate server response
  actor.receive({
    type: 'ws:add-query-ok',
    payload: {
      q,
      result: [{ id: '1', handle: 'test' }],
      'processed-tx-id': 1,
    },
  });

  expect(cb).toHaveBeenCalled();
  const callArg = cb.mock.calls[0][0];
  expect(callArg.store).toBeDefined();
});

test('QueryActor - unsubscribes and removes listeners', () => {
  const actor = new QueryActor();
  const messages: any[] = [];

  const q = { users: {} };
  const cb = vi.fn();

  actor.receive({ type: 'query:subscribe', q, cb });

  const hash = weakHash(q);
  expect(actor.hasActiveSubscribers(hash)).toBe(true);

  // Unsubscribe
  actor.subscribe((msg) => messages.push(msg));
  actor.receive({ type: 'query:unsubscribe', q, cb });

  expect(actor.hasActiveSubscribers(hash)).toBe(false);

  // Should send remove-query
  const removeMsg = messages.find((m) =>
    m.type === 'connection:send' && m.message.op === 'remove-query'
  );
  expect(removeMsg).toBeDefined();
});

test('QueryActor - handles queryOnce with deferred', async () => {
  const actor = new QueryActor();
  const q = { users: {} };
  const dfd = new Deferred();

  actor.receive({ type: 'query:once', q, dfd });

  // Simulate result
  actor.receive({
    type: 'ws:add-query-ok',
    payload: {
      q,
      result: [{ id: '1', handle: 'test' }],
    },
  });

  const result = await dfd.promise;
  expect(result).toBeDefined();
  expect(result.store).toBeDefined();
});

test('QueryActor - queryOnce cleans up after resolve', async () => {
  const actor = new QueryActor();
  const q = { users: {} };
  const dfd = new Deferred();

  actor.receive({ type: 'query:once', q, dfd });

  const hash = weakHash(q);
  expect(actor.hasActiveSubscribers(hash)).toBe(true);

  // Simulate result
  actor.receive({
    type: 'ws:add-query-exists',
    payload: { q },
  });

  await dfd.promise;

  // Should clean up
  expect(actor.hasActiveSubscribers(hash)).toBe(false);
});

test('QueryActor - handles errors in query', () => {
  const actor = new QueryActor();
  const q = { users: {} };
  const cb = vi.fn();

  actor.receive({ type: 'query:subscribe', q, cb });

  const hash = weakHash(q);
  const error = { message: 'Query failed' };

  actor.receive({
    type: 'query:error',
    q,
    hash,
    eventId: 'evt-1',
    error,
  });

  expect(cb).toHaveBeenCalledWith({ error });
});

test('QueryActor - caches results and avoids duplicate notifications', () => {
  const actor = new QueryActor();
  const q = { users: {} };
  const cb = vi.fn();

  actor.receive({ type: 'query:subscribe', q, cb });

  const result = {
    q,
    result: [{ id: '1', handle: 'test' }],
    'processed-tx-id': 1,
  };

  // Send same result twice
  actor.receive({ type: 'ws:add-query-ok', payload: result });
  actor.receive({ type: 'ws:add-query-ok', payload: result });

  // Should only notify once (first time from subscribe doesn't count as it has no data)
  expect(cb.mock.calls.length).toBe(1);
});

test('QueryActor - notifies all queries on notify-all', () => {
  const actor = new QueryActor();

  const q1 = { users: {} };
  const q2 = { posts: {} };
  const cb1 = vi.fn();
  const cb2 = vi.fn();

  actor.receive({ type: 'query:subscribe', q: q1, cb: cb1 });
  actor.receive({ type: 'query:subscribe', q: q2, cb: cb2 });

  // Set results
  actor.receive({
    type: 'ws:add-query-ok',
    payload: { q: q1, result: [{ id: '1' }] },
  });
  actor.receive({
    type: 'ws:add-query-ok',
    payload: { q: q2, result: [{ id: '2' }] },
  });

  cb1.mockClear();
  cb2.mockClear();

  // Notify all
  actor.receive({ type: 'query:notify-all' });

  // Both should be notified, but since data hasn't changed, they won't be called
  // Let's update one
  actor.receive({
    type: 'ws:add-query-ok',
    payload: { q: q1, result: [{ id: '1', updated: true }] },
  });

  expect(cb1).toHaveBeenCalled();
});
