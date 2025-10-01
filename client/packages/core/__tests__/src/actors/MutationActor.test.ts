import { test, expect, vi } from 'vitest';
import { MutationActor } from '../../../src/actors/MutationActor';

test('MutationActor - pushes mutation and sends to server', () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  // Set authenticated
  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  // Should send to connection
  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.op).toBe('transact');
  expect(sendMsg.message['tx-steps']).toEqual(txSteps);

  // Should have deferred
  const dfdMsg = messages.find((m) => m.type === 'mutation:deferred');
  expect(dfdMsg).toBeDefined();
  expect(dfdMsg.deferred).toBeDefined();
});

test('MutationActor - resolves deferred on transact-ok', async () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  const dfdMsg = messages.find((m) => m.type === 'mutation:deferred');
  const sendMsg = messages.find((m) => m.type === 'connection:send');

  // Simulate server response
  actor.receive({
    type: 'ws:transact-ok',
    payload: {
      'client-event-id': sendMsg.eventId,
      'tx-id': 100,
    },
  });

  const result = await dfdMsg.deferred.promise;
  expect(result.status).toBe('synced');
  expect(result.eventId).toBe(sendMsg.eventId);
});

test('MutationActor - rejects deferred on error', async () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  const dfdMsg = messages.find((m) => m.type === 'mutation:deferred');
  const sendMsg = messages.find((m) => m.type === 'connection:send');

  // Simulate error
  actor.receive({
    type: 'mutation:error',
    eventId: sendMsg.eventId,
    error: { message: 'Invalid transaction' },
  });

  await expect(dfdMsg.deferred.promise).rejects.toThrow('Invalid transaction');
});

test('MutationActor - enqueues when not authenticated', () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  // Don't set authenticated
  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  const dfdMsg = messages.find((m) => m.type === 'mutation:deferred');

  // Should not send to connection
  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeUndefined();

  // Should mark as enqueued
  const statusMsg = messages.find(
    (m) => m.type === 'mutation:status' && m.status === 'enqueued',
  );
  expect(statusMsg).toBeDefined();
});

test('MutationActor - flushes pending when authenticated', () => {
  const actor = new MutationActor();
  const messages: any[] = [];

  // Push mutation while not authenticated
  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  // Now authenticate and subscribe
  actor.subscribe((msg) => messages.push(msg));
  actor.receive({ type: 'connection:status', status: 'authenticated' });

  // Should flush pending
  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message['tx-steps']).toEqual(txSteps);
});

test('MutationActor - cleans up processed mutations', () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  const sendMsg = messages.find((m) => m.type === 'connection:send');

  // Confirm mutation
  actor.receive({
    type: 'ws:transact-ok',
    payload: {
      'client-event-id': sendMsg.eventId,
      'tx-id': 100,
    },
  });

  expect(actor.hasPendingMutation(sendMsg.eventId)).toBe(true);

  // Cleanup
  actor.receive({ type: 'mutation:cleanup', processedTxId: 100 });

  expect(actor.hasPendingMutation(sendMsg.eventId)).toBe(false);
});

test('MutationActor - orders mutations correctly', () => {
  const actor = new MutationActor();
  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  // Push multiple mutations
  actor.receive({ type: 'mutation:push', txSteps: [['step1']] });
  actor.receive({ type: 'mutation:push', txSteps: [['step2']] });
  actor.receive({ type: 'mutation:push', txSteps: [['step3']] });

  const pending = actor.getPendingMutations();
  const orders = Array.from(pending.values()).map((m) => m.order);

  expect(orders).toEqual([1, 2, 3]);
});

test('MutationActor - notifies queries on mutation push', () => {
  const actor = new MutationActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:status', status: 'authenticated' });

  const txSteps = [['add-triple', 'e1', 'a1', 'v1']];
  actor.receive({ type: 'mutation:push', txSteps });

  const notifyMsg = messages.find((m) => m.type === 'query:notify-all');
  expect(notifyMsg).toBeDefined();
});
