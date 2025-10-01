import { create } from 'mutative';
import { assocInMutative, dissocInMutative, insertInMutative } from '../utils/object.js';
import { buildPresenceSlice, hasPresenceResponseChanged } from '../presence.ts';

interface PresenceHandler {
  roomId: string;
  opts: any;
  cb: (slice: any) => void;
  prev: any;
}

interface PresenceState {
  result?: { user?: any; peers?: Record<string, any> };
  handlers: PresenceHandler[];
}

interface BroadcastItem {
  topic: string;
  roomType: string;
  data: any;
}

export interface RoomManagerDeps {
  sendAuthed(eventId: string, msg: any): void;
  generateEventId(): string;
}

export class RoomManager {
  private rooms = new Map<string, { isConnected: boolean; error: any }>();
  private pendingLeave = new Set<string>();
  private presence = new Map<string, PresenceState>();
  private broadcastQueue = new Map<string, BroadcastItem[]>();
  private broadcastSubs = new Map<string, Map<string, Array<(data: any, peer: any) => void>>>();
  private sessionId: string | null = null;

  constructor(private readonly deps: RoomManagerDeps) {}

  setSessionId(sessionId: string | null) {
    this.sessionId = sessionId;
  }

  joinRoom(roomId: string, initialData?: any) {
    const room = this.ensureRoom(roomId);
    room.error = undefined;

    if (initialData) {
      const entry = this.ensurePresence(roomId);
      entry.result = entry.result || {};
      entry.result.user = initialData;
      this.notifyPresenceSubs(roomId);
    }

    this.sendJoin(roomId, initialData);
    this.pendingLeave.delete(roomId);

    return () => {
      this.cleanupRoom(roomId);
    };
  }

  publishPresence(roomId: string, partialData: any) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const entry = this.ensurePresence(roomId);
    entry.result = entry.result || {};
    entry.result.user = {
      ...entry.result.user,
      ...partialData,
    };

    if (!room.isConnected) {
      return;
    }

    this.sendPresence(roomId, entry.result.user);
    this.notifyPresenceSubs(roomId);
  }

  getPresence(roomType: string, roomId: string, opts: any = {}) {
    const room = this.rooms.get(roomId);
    const entry = this.presence.get(roomId);
    if (!room || !entry || !entry.result) {
      return null;
    }

    return {
      ...buildPresenceSlice(entry.result, { ...opts, roomType }, this.sessionId),
      isLoading: !room.isConnected,
      error: room.error,
    };
  }

  subscribePresence(roomType: string, roomId: string, opts: any, cb: (slice: any) => void) {
    const leaveRoom = this.joinRoom(roomId, opts?.data);

    const entry = this.ensurePresence(roomId);
    const handler: PresenceHandler = {
      roomId,
      opts: { ...opts, roomType },
      cb,
      prev: null,
    };
    entry.handlers.push(handler);

    this.notifyPresenceSub(roomId, handler);

    return () => {
      entry.handlers = entry.handlers.filter((h) => h !== handler);
      leaveRoom();
    };
  }

  publishTopic({ roomType, roomId, topic, data }: { roomType: string; roomId: string; topic: string; data: any }) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    if (!room.isConnected) {
      const queue = this.broadcastQueue.get(roomId) ?? [];
      queue.push({ topic, roomType, data });
      this.broadcastQueue.set(roomId, queue);
      return;
    }

    this.sendBroadcast(roomId, roomType, topic, data);
  }

  subscribeTopic(roomId: string, topic: string, cb: (data: any, peer: any) => void) {
    const leaveRoom = this.joinRoom(roomId);

    const subsForRoom = this.broadcastSubs.get(roomId) ?? new Map();
    const topicSubs = subsForRoom.get(topic) ?? [];
    topicSubs.push(cb);
    subsForRoom.set(topic, topicSubs);
    this.broadcastSubs.set(roomId, subsForRoom);

    return () => {
      const updatedSubs = (subsForRoom.get(topic) ?? []).filter((fn) => fn !== cb);
      if (updatedSubs.length) {
        subsForRoom.set(topic, updatedSubs);
      } else {
        subsForRoom.delete(topic);
      }
      if (subsForRoom.size === 0) {
        this.broadcastSubs.delete(roomId);
      } else {
        this.broadcastSubs.set(roomId, subsForRoom);
      }
      leaveRoom();
    };
  }

  handleJoinRoomOk(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      if (this.pendingLeave.has(roomId)) {
        this.sendLeave(roomId);
        this.pendingLeave.delete(roomId);
      }
      return;
    }

    room.isConnected = true;
    room.error = undefined;
    this.rooms.set(roomId, room);

    this.flushRoom(roomId);
  }

  handleJoinRoomError(roomId: string, error: any) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.error = error;
      this.rooms.set(roomId, room);
      this.notifyPresenceSubs(roomId);
    }
  }

  handlePatchPresence(roomId: string, edits: Array<[Array<string | number>, string, any]>) {
    const entry = this.ensurePresence(roomId);
    const peers = entry.result?.peers || {};
    let sessions = Object.fromEntries(
      Object.entries(peers).map(([session, data]) => [session, { data }]),
    );

    const updated = create(sessions, (draft) => {
      for (const [path, op, value] of edits) {
        switch (op) {
          case '+':
            insertInMutative(draft, path, value);
            break;
          case 'r':
            assocInMutative(draft, path, value);
            break;
          case '-':
            dissocInMutative(draft, path);
            break;
        }
      }
      if (this.sessionId) {
        delete draft[this.sessionId];
      }
    });

    this.setPresencePeers(roomId, updated);
  }

  handleRefreshPresence(roomId: string, data: Record<string, { data: any }>) {
    this.setPresencePeers(roomId, data);
  }

  handleServerBroadcast(roomId: string, topic: string, msg: any) {
    const topicSubs = this.broadcastSubs.get(roomId)?.get(topic) ?? [];
    if (!topicSubs.length) {
      return;
    }

    const entry = this.presence.get(roomId);
    const peers = entry?.result?.peers || {};

    const peer =
      msg.data?.['peer-id'] === this.sessionId
        ? entry?.result?.user
        : peers?.[msg.data?.['peer-id']];

    topicSubs.forEach((cb) => cb(msg.data?.data, peer));
  }

  handleSocketClosed() {
    for (const [roomId, room] of this.rooms.entries()) {
      room.isConnected = false;
      this.rooms.set(roomId, room);
      this.notifyPresenceSubs(roomId);
    }
  }

  resendJoins() {
    for (const roomId of this.rooms.keys()) {
      const userPresence = this.presence.get(roomId)?.result?.user;
      this.sendJoin(roomId, userPresence);
    }
  }

  getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }

  private ensureRoom(roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { isConnected: false, error: undefined });
    }
    return this.rooms.get(roomId)!;
  }

  private ensurePresence(roomId: string) {
    if (!this.presence.has(roomId)) {
      this.presence.set(roomId, { result: {}, handlers: [] });
    }
    return this.presence.get(roomId)!;
  }

  private sendJoin(roomId: string, data?: any) {
    this.deps.sendAuthed(this.deps.generateEventId(), {
      op: 'join-room',
      'room-id': roomId,
      data,
    });
  }

  private sendLeave(roomId: string) {
    this.deps.sendAuthed(this.deps.generateEventId(), {
      op: 'leave-room',
      'room-id': roomId,
    });
  }

  private sendPresence(roomId: string, data: any) {
    this.deps.sendAuthed(this.deps.generateEventId(), {
      op: 'set-presence',
      'room-id': roomId,
      data,
    });
  }

  private sendBroadcast(roomId: string, roomType: string, topic: string, data: any) {
    this.deps.sendAuthed(this.deps.generateEventId(), {
      op: 'client-broadcast',
      'room-id': roomId,
      roomType,
      topic,
      data,
    });
  }

  private flushRoom(roomId: string) {
    const queue = this.broadcastQueue.get(roomId) ?? [];
    if (queue.length) {
      queue.forEach(({ topic, roomType, data }) => {
        this.sendBroadcast(roomId, roomType, topic, data);
      });
      this.broadcastQueue.set(roomId, []);
    }

    const entry = this.presence.get(roomId);
    const userPresence = entry?.result?.user;
    if (userPresence) {
      this.sendPresence(roomId, userPresence);
    }

    this.notifyPresenceSubs(roomId);
  }

  private setPresencePeers(roomId: string, data: Record<string, { data: any }>) {
    const entry = this.ensurePresence(roomId);
    const sessions = { ...data };
    if (this.sessionId) {
      delete sessions[this.sessionId];
    }
    const peers = Object.fromEntries(
      Object.entries(sessions).map(([sessionId, value]) => [sessionId, value.data]),
    );

    entry.result = entry.result || {};
    entry.result.peers = peers;
    this.presence.set(roomId, entry);
    this.notifyPresenceSubs(roomId);
  }

  private notifyPresenceSubs(roomId: string) {
    const entry = this.presence.get(roomId);
    if (!entry) return;
    entry.handlers.forEach((handler) => {
      this.notifyPresenceSub(roomId, handler);
    });
  }

  private notifyPresenceSub(roomId: string, handler: PresenceHandler) {
    const entry = this.presence.get(roomId);
    const room = this.rooms.get(roomId);
    if (!entry || !entry.result || !room) {
      return;
    }

    const slice = {
      ...buildPresenceSlice(entry.result, handler.opts, this.sessionId),
      isLoading: !room.isConnected,
      error: room.error,
    };

    if (handler.prev && hasPresenceResponseChanged(slice, handler.prev) === false) {
      return;
    }

    handler.prev = slice;
    handler.cb(slice);
  }

  private cleanupRoom(roomId: string) {
    const presenceHandlers = this.presence.get(roomId)?.handlers?.length ?? 0;
    const topicMap = this.broadcastSubs.get(roomId);
    const hasBroadcastSubs = topicMap
      ? Array.from(topicMap.values()).some((subs) => subs.length > 0)
      : false;

    if (presenceHandlers || hasBroadcastSubs) {
      return;
    }

    const room = this.rooms.get(roomId);
    if (room?.isConnected) {
      this.sendLeave(roomId);
    } else {
      this.pendingLeave.add(roomId);
    }

    this.rooms.delete(roomId);
    this.presence.delete(roomId);
    this.broadcastSubs.delete(roomId);
    this.broadcastQueue.delete(roomId);
  }
}
