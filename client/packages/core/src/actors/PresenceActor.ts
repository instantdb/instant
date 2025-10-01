import { BaseActor, Message } from './BaseActor.js';

interface Room {
  isConnected: boolean;
  error?: any;
}

interface PresenceData {
  user?: any;
  peers?: Record<string, any>;
}

interface PresenceState {
  rooms: Map<string, Room>;
  presence: Map<string, PresenceData>;
  roomsPendingLeave: Set<string>;
  sessionId?: string;
}

/**
 * PresenceActor manages room presence.
 *
 * Receives:
 * - { type: 'presence:join-room', roomId, initialData }
 * - { type: 'presence:leave-room', roomId }
 * - { type: 'presence:set', roomId, data }
 * - { type: 'ws:join-room-ok', payload }
 * - { type: 'ws:join-room-error', payload }
 * - { type: 'ws:patch-presence', payload }
 * - { type: 'ws:refresh-presence', payload }
 * - { type: 'ws:init-ok', payload } -> get session-id
 *
 * Publishes:
 * - { type: 'connection:send', eventId, message }
 * - { type: 'presence:updated', roomId, presence }
 */
export class PresenceActor extends BaseActor<PresenceState> {
  constructor() {
    super('Presence', {
      rooms: new Map(),
      presence: new Map(),
      roomsPendingLeave: new Set(),
    });
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'presence:join-room':
        this.joinRoom(message.roomId, message.initialData);
        break;

      case 'presence:leave-room':
        this.leaveRoom(message.roomId);
        break;

      case 'presence:set':
        this.setPresence(message.roomId, message.data);
        break;

      case 'ws:init-ok':
        this.state.sessionId = message.payload['session-id'];
        this.flushRooms();
        break;

      case 'ws:join-room-ok':
        this.handleJoinOk(message.payload['room-id']);
        break;

      case 'ws:join-room-error':
        this.handleJoinError(message.payload['room-id'], message.payload.error);
        break;

      case 'ws:patch-presence':
        this.patchPresence(message.payload['room-id'], message.payload.edits);
        break;

      case 'ws:refresh-presence':
        this.refreshPresence(message.payload['room-id'], message.payload.data);
        break;
    }
  }

  private joinRoom(roomId: string, initialData?: any): void {
    if (!this.state.rooms.has(roomId)) {
      this.state.rooms.set(roomId, { isConnected: false });
    }

    if (!this.state.presence.has(roomId)) {
      this.state.presence.set(roomId, {});
    }

    if (initialData) {
      const presence = this.state.presence.get(roomId)!;
      presence.user = initialData;
    }

    this.tryJoinRoom(roomId, initialData);
  }

  private tryJoinRoom(roomId: string, data?: any): void {
    if (!this.state.sessionId) return;

    this.state.roomsPendingLeave.delete(roomId);

    const eventId = this.generateEventId();
    this.publish({
      type: 'connection:send',
      eventId,
      message: { op: 'join-room', 'room-id': roomId, data },
    });
  }

  private leaveRoom(roomId: string): void {
    const room = this.state.rooms.get(roomId);
    if (!room) return;

    this.state.rooms.delete(roomId);
    this.state.presence.delete(roomId);

    if (room.isConnected) {
      const eventId = this.generateEventId();
      this.publish({
        type: 'connection:send',
        eventId,
        message: { op: 'leave-room', 'room-id': roomId },
      });
    } else {
      this.state.roomsPendingLeave.add(roomId);
    }
  }

  private setPresence(roomId: string, data: any): void {
    const room = this.state.rooms.get(roomId);
    const presence = this.state.presence.get(roomId);

    if (!room || !presence) return;

    presence.user = { ...presence.user, ...data };

    if (room.isConnected) {
      const eventId = this.generateEventId();
      this.publish({
        type: 'connection:send',
        eventId,
        message: { op: 'set-presence', 'room-id': roomId, data: presence.user },
      });
    }

    this.notifyPresence(roomId);
  }

  private handleJoinOk(roomId: string): void {
    const room = this.state.rooms.get(roomId);
    if (!room) {
      if (this.state.roomsPendingLeave.has(roomId)) {
        this.tryLeaveRoom(roomId);
        this.state.roomsPendingLeave.delete(roomId);
      }
      return;
    }

    room.isConnected = true;
    this.notifyPresence(roomId);
  }

  private handleJoinError(roomId: string, error: any): void {
    const room = this.state.rooms.get(roomId);
    if (room) {
      room.error = error;
      this.notifyPresence(roomId);
    }
  }

  private patchPresence(roomId: string, edits: any[]): void {
    const presence = this.state.presence.get(roomId);
    if (!presence) return;

    // Simplified patch logic - real impl would use mutative
    presence.peers = presence.peers || {};

    for (const [path, op, value] of edits) {
      if (op === '+' || op === 'r') {
        const key = path[0];
        if (key !== this.state.sessionId) {
          presence.peers[key] = value;
        }
      } else if (op === '-') {
        const key = path[0];
        delete presence.peers[key];
      }
    }

    this.notifyPresence(roomId);
  }

  private refreshPresence(roomId: string, data: any): void {
    const presence = this.state.presence.get(roomId);
    if (!presence) return;

    // Filter out self
    const peers: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== this.state.sessionId) {
        peers[key] = (value as any).data;
      }
    }

    presence.peers = peers;
    this.notifyPresence(roomId);
  }

  private tryLeaveRoom(roomId: string): void {
    const eventId = this.generateEventId();
    this.publish({
      type: 'connection:send',
      eventId,
      message: { op: 'leave-room', 'room-id': roomId },
    });
  }

  private flushRooms(): void {
    for (const [roomId, room] of this.state.rooms.entries()) {
      const presence = this.state.presence.get(roomId);
      this.tryJoinRoom(roomId, presence?.user);
    }
  }

  private notifyPresence(roomId: string): void {
    const room = this.state.rooms.get(roomId);
    const presence = this.state.presence.get(roomId);

    this.publish({
      type: 'presence:updated',
      roomId,
      presence: {
        user: presence?.user,
        peers: presence?.peers || {},
        isLoading: !room?.isConnected,
        error: room?.error,
      },
    });
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  isConnected(roomId: string): boolean {
    return this.state.rooms.get(roomId)?.isConnected || false;
  }
}
