import { describe, expect, it } from 'vitest';
import { createPresenceActor } from './presenceActor.ts';
import createLogger from '../../utils/log.ts';

describe('presence actor', () => {
  it('queues presence and broadcasts until room connects', async () => {
    const actor = createPresenceActor({ logger: createLogger(false) });

    actor.send({ type: 'ensure-room', roomId: 'room-1' });
    const firstNotifications = await actor.ask({ type: 'drain-notifications' });
    expect(firstNotifications).toEqual([{ type: 'join-room', roomId: 'room-1' }]);

    actor.send({ type: 'set-local-presence', roomId: 'room-1', payload: { status: 'online' } });
    actor.send({
      type: 'enqueue-broadcast',
      roomId: 'room-1',
      topic: 'chat',
      payload: { text: 'hi' },
    });

    actor.send({ type: 'mark-joined', roomId: 'room-1' });
    let notifications = await actor.ask({ type: 'drain-notifications' });
    expect(notifications).toEqual([
      { type: 'send-presence', roomId: 'room-1', payload: { status: 'online' } },
      { type: 'broadcast', roomId: 'room-1', topic: 'chat', payload: { text: 'hi' } },
    ]);

    actor.send({ type: 'update-peers', roomId: 'room-1', peers: { user: { status: 'online' } } });
    notifications = await actor.ask({ type: 'drain-notifications' });
    expect(notifications).toEqual([
      {
        type: 'presence-updated',
        roomId: 'room-1',
        payload: { user: { status: 'online' } },
      },
    ]);

    actor.send({
      type: 'incoming-broadcast',
      roomId: 'room-1',
      topic: 'chat',
      payload: { text: 'sup' },
    });
    notifications = await actor.ask({ type: 'drain-notifications' });
    expect(notifications).toEqual([
      {
        type: 'incoming-broadcast',
        roomId: 'room-1',
        topic: 'chat',
        payload: { text: 'sup' },
      },
    ]);

    actor.send({ type: 'leave-room', roomId: 'room-1' });
    notifications = await actor.ask({ type: 'drain-notifications' });
    expect(notifications).toEqual([{ type: 'leave-room', roomId: 'room-1' }]);
  });
});
