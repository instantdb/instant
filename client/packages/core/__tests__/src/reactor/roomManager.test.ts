import { describe, expect, test, vi } from 'vitest';

import { RoomManager } from '../../../src/reactor/roomManager';

const createDeps = () => {
  const sendAuthed = vi.fn();
  let counter = 0;
  return {
    manager: new RoomManager({
      sendAuthed,
      generateEventId: () => `evt-${++counter}`,
    }),
    sendAuthed,
  };
};

describe('RoomManager', () => {
  test('join room sends join and flushes presence on connect', () => {
    const { manager, sendAuthed } = createDeps();

    const unsubscribe = manager.joinRoom('room-1', { status: 'online' });

    expect(sendAuthed).toHaveBeenCalledWith('evt-1', {
      op: 'join-room',
      'room-id': 'room-1',
      data: { status: 'online' },
    });

    manager.handleJoinRoomOk('room-1');

    expect(sendAuthed).toHaveBeenLastCalledWith('evt-2', expect.objectContaining({
      op: 'set-presence',
      'room-id': 'room-1',
    }));

    unsubscribe();
  });

  test('presence subscriptions receive updates', () => {
    const { manager, sendAuthed } = createDeps();
    const handler = vi.fn();

    const unsubscribe = manager.subscribePresence('room', 'room-1', {}, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].isLoading).toBe(true);

    manager.handleJoinRoomOk('room-1');
    expect(handler.mock.calls[1][0].isLoading).toBe(false);

    manager.handleRefreshPresence('room-1', {
      'session-2': { data: { status: 'away' } },
    });

    expect(handler.mock.calls[2][0].peers['session-2'].status).toBe('away');

    manager.publishPresence('room-1', { status: 'busy' });
    expect(sendAuthed).toHaveBeenLastCalledWith(expect.any(String), {
      op: 'set-presence',
      'room-id': 'room-1',
      data: { status: 'busy' },
    });

    unsubscribe();
  });

  test('broadcasts queue while disconnected and flush after connect', () => {
    const { manager, sendAuthed } = createDeps();

    const unsubscribe = manager.subscribeTopic('room-1', 'chat', () => {});

    manager.publishTopic({ roomType: 'chat', roomId: 'room-1', topic: 'message', data: { text: 'hi' } });

    // no send yet because room not connected
    expect(sendAuthed).toHaveBeenCalledTimes(1);

    manager.handleJoinRoomOk('room-1');

    expect(sendAuthed).toHaveBeenLastCalledWith(expect.any(String), {
      op: 'client-broadcast',
      'room-id': 'room-1',
      roomType: 'chat',
      topic: 'message',
      data: { text: 'hi' },
    });

    unsubscribe();
  });

  test('handleServerBroadcast forwards to subscribers with peer info', () => {
    const { manager } = createDeps();
    const cb = vi.fn();

    manager.subscribeTopic('room-1', 'chat', cb);
    manager.handleJoinRoomOk('room-1');

    manager.handleRefreshPresence('room-1', {
      'session-1': { data: { status: 'online' } },
    });

    manager.setSessionId('session-0');

    manager.handleServerBroadcast('room-1', 'chat', {
      data: {
        'peer-id': 'session-1',
        data: { text: 'hey' },
      },
    });

    expect(cb).toHaveBeenCalledWith({ text: 'hey' }, { status: 'online' });
  });
});
