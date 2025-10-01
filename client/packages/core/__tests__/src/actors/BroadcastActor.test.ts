import { test, expect, vi } from 'vitest';
import { BroadcastActor } from '../../../src/actors/BroadcastActor';

test('BroadcastActor - subscribes to topic', () => {
  const actor = new BroadcastActor();
  const callback = vi.fn();

  actor.receive({
    type: 'broadcast:subscribe',
    roomId: 'room-1',
    topic: 'chat',
    callback,
  });

  expect(actor.getSubscriptionCount('room-1', 'chat')).toBe(1);
});

test('BroadcastActor - publishes when room connected', () => {
  const actor = new BroadcastActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  actor.receive({
    type: 'broadcast:publish',
    roomId: 'room-1',
    topic: 'chat',
    data: { message: 'hello' },
  });

  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.op).toBe('client-broadcast');
  expect(sendMsg.message.data).toEqual({ message: 'hello' });
});

test('BroadcastActor - queues when room not connected', () => {
  const actor = new BroadcastActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'broadcast:publish',
    roomId: 'room-1',
    topic: 'chat',
    data: { message: 'hello' },
  });

  // Should not send yet
  let sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeUndefined();

  // Connect room
  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  // Should flush queue
  sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
});

test('BroadcastActor - notifies subscribers on server broadcast', () => {
  const actor = new BroadcastActor();
  const callback = vi.fn();

  actor.receive({
    type: 'broadcast:subscribe',
    roomId: 'room-1',
    topic: 'chat',
    callback,
  });

  actor.receive({
    type: 'ws:server-broadcast',
    payload: {
      'room-id': 'room-1',
      topic: 'chat',
      data: {
        data: { message: 'hello from server' },
        'peer-id': 'peer-1',
      },
    },
  });

  expect(callback).toHaveBeenCalledWith(
    { message: 'hello from server' },
    undefined, // no presence cached
  );
});

test('BroadcastActor - unsubscribes from topic', () => {
  const actor = new BroadcastActor();
  const callback = vi.fn();

  actor.receive({
    type: 'broadcast:subscribe',
    roomId: 'room-1',
    topic: 'chat',
    callback,
  });

  expect(actor.getSubscriptionCount('room-1', 'chat')).toBe(1);

  actor.receive({
    type: 'broadcast:unsubscribe',
    roomId: 'room-1',
    topic: 'chat',
    callback,
  });

  expect(actor.getSubscriptionCount('room-1', 'chat')).toBe(0);
});
