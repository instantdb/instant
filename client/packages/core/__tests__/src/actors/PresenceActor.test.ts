import { test, expect } from 'vitest';
import { PresenceActor } from '../../../src/actors/PresenceActor';

test('PresenceActor - joins room after session established', () => {
  const actor = new PresenceActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'ws:init-ok', payload: { 'session-id': 'session-1' } });
  actor.receive({ type: 'presence:join-room', roomId: 'room-1' });

  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.op).toBe('join-room');
  expect(sendMsg.message['room-id']).toBe('room-1');
});

test('PresenceActor - sets presence when room connected', () => {
  const actor = new PresenceActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'ws:init-ok', payload: { 'session-id': 'session-1' } });
  actor.receive({ type: 'presence:join-room', roomId: 'room-1' });
  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  actor.receive({
    type: 'presence:set',
    roomId: 'room-1',
    data: { name: 'Alice' },
  });

  const sendMsg = messages.find(
    (m) => m.type === 'connection:send' && m.message.op === 'set-presence',
  );
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.data).toEqual({ name: 'Alice' });
});

test('PresenceActor - notifies on join-ok', () => {
  const actor = new PresenceActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'ws:init-ok', payload: { 'session-id': 'session-1' } });
  actor.receive({ type: 'presence:join-room', roomId: 'room-1' });

  expect(actor.isConnected('room-1')).toBe(false);

  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  expect(actor.isConnected('room-1')).toBe(true);

  const updateMsg = messages.find((m) => m.type === 'presence:updated');
  expect(updateMsg).toBeDefined();
  expect(updateMsg.roomId).toBe('room-1');
});

test('PresenceActor - leaves room', () => {
  const actor = new PresenceActor();
  const messages: any[] = [];

  actor.receive({ type: 'ws:init-ok', payload: { 'session-id': 'session-1' } });
  actor.receive({ type: 'presence:join-room', roomId: 'room-1' });
  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  actor.subscribe((msg) => messages.push(msg));
  actor.receive({ type: 'presence:leave-room', roomId: 'room-1' });

  const sendMsg = messages.find((m) => m.type === 'connection:send');
  expect(sendMsg).toBeDefined();
  expect(sendMsg.message.op).toBe('leave-room');
});

test('PresenceActor - patches presence from server', () => {
  const actor = new PresenceActor();
  const messages: any[] = [];

  actor.receive({ type: 'ws:init-ok', payload: { 'session-id': 'session-1' } });
  actor.receive({ type: 'presence:join-room', roomId: 'room-1' });
  actor.receive({ type: 'ws:join-room-ok', payload: { 'room-id': 'room-1' } });

  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'ws:patch-presence',
    payload: {
      'room-id': 'room-1',
      edits: [
        [['peer-1'], '+', { name: 'Bob' }],
      ],
    },
  });

  const updateMsg = messages.find((m) => m.type === 'presence:updated');
  expect(updateMsg.presence.peers['peer-1']).toEqual({ name: 'Bob' });
});
