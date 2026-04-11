/** Presence, rooms, and broadcast smoke tests. */
import { describe, it, expect } from '../framework.js';
import {
  connectWS, wsInit, wsSend, wsWaitFor, TestApp, uuid, sleep,
} from '../helpers.js';

export async function presenceTests(app: TestApp) {
  await describe('Presence & Rooms', async () => {
    await it('join-room: returns ok with room data', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eventId = uuid();
      wsSend(ws, {
        op: 'join-room',
        'room-id': 'test-room-1',
        'peer-id': 'peer-1',
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'join-room-ok');
      expect(msg['room-id']).toBe('test-room-1');
      expect(msg.data).toBeDefined();
      ws.close();
    });

    await it('set-presence: updates presence data', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'join-room',
        'room-id': 'presence-room',
        'peer-id': 'p1',
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'join-room-ok');

      const eventId = uuid();
      wsSend(ws, {
        op: 'set-presence',
        'room-id': 'presence-room',
        data: { cursor: { x: 100, y: 200 }, status: 'active' },
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'set-presence-ok');
      expect(msg.op).toBe('set-presence-ok');
      ws.close();
    });

    await it('refresh-presence: returns room state', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'join-room',
        'room-id': 'refresh-room',
        'peer-id': 'p1',
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'join-room-ok');

      const eventId = uuid();
      wsSend(ws, {
        op: 'refresh-presence',
        'room-id': 'refresh-room',
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) =>
        m.op === 'refresh-presence-ok' && m['client-event-id'] === eventId,
      );
      expect(msg.data).toBeDefined();
      ws.close();
    });

    await it('leave-room: removes from room', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'join-room',
        'room-id': 'leave-room',
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'join-room-ok');

      const eventId = uuid();
      wsSend(ws, {
        op: 'leave-room',
        'room-id': 'leave-room',
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'leave-room-ok');
      expect(msg.op).toBe('leave-room-ok');
      ws.close();
    });

    await it('client-broadcast: peer receives message', async () => {
      const ws1 = await connectWS(app.id);
      const ws2 = await connectWS(app.id);
      await wsInit(ws1, app);
      await wsInit(ws2, app);

      // Both join same room
      wsSend(ws1, { op: 'join-room', 'room-id': 'broadcast-room', 'peer-id': 'p1', 'client-event-id': uuid() });
      wsSend(ws2, { op: 'join-room', 'room-id': 'broadcast-room', 'peer-id': 'p2', 'client-event-id': uuid() });
      await wsWaitFor(ws1, (m) => m.op === 'join-room-ok');
      await wsWaitFor(ws2, (m) => m.op === 'join-room-ok');

      // ws1 broadcasts
      wsSend(ws1, {
        op: 'client-broadcast',
        'room-id': 'broadcast-room',
        topic: 'emoji-reaction',
        data: { emoji: '🎉', from: 'p1' },
        'peer-id': 'p1',
        'client-event-id': uuid(),
      });

      // ws2 should receive it
      const msg = await wsWaitFor(ws2, (m) =>
        m.op === 'server-broadcast' && m.topic === 'emoji-reaction',
      );
      expect(msg.data.emoji).toBe('🎉');

      ws1.close();
      ws2.close();
    });

    await it('presence update propagates to peers', async () => {
      const ws1 = await connectWS(app.id);
      const ws2 = await connectWS(app.id);
      await wsInit(ws1, app);
      await wsInit(ws2, app);

      wsSend(ws1, { op: 'join-room', 'room-id': 'peer-pres-room', 'peer-id': 'p1', 'client-event-id': uuid() });
      wsSend(ws2, { op: 'join-room', 'room-id': 'peer-pres-room', 'peer-id': 'p2', 'client-event-id': uuid() });
      await wsWaitFor(ws1, (m) => m.op === 'join-room-ok');
      await wsWaitFor(ws2, (m) => m.op === 'join-room-ok');

      // ws1 sets presence
      wsSend(ws1, {
        op: 'set-presence',
        'room-id': 'peer-pres-room',
        data: { typing: true },
        'client-event-id': uuid(),
      });

      // ws2 should get refresh-presence
      const msg = await wsWaitFor(ws2, (m) => m.op === 'refresh-presence');
      expect(msg.data).toBeDefined();

      ws1.close();
      ws2.close();
    });
  });
}
