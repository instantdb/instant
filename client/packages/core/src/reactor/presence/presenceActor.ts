import { Actor } from '../actors/core.ts';
import type { ActorRef } from '../actors/core.ts';
import type { Logger } from '../../utils/log.ts';

export interface PresenceNotification {
  type:
    | 'join-room'
    | 'leave-room'
    | 'send-presence'
    | 'broadcast'
    | 'presence-updated'
    | 'incoming-broadcast';
  roomId: string;
  payload?: unknown;
  topic?: string;
}

interface RoomState {
  id: string;
  isConnected: boolean;
  joinRequested: boolean;
  pendingPresence: unknown | null;
  localPresence: unknown | null;
  peers: Record<string, unknown>;
  broadcastQueue: Array<{ topic: string; payload: unknown }>;
}

interface PresenceActorState {
  rooms: Record<string, RoomState>;
  notifications: PresenceNotification[];
}

export interface PresenceActorOptions {
  logger: Logger;
}

type PresenceEvent =
  | { type: 'ensure-room'; roomId: string }
  | { type: 'mark-joined'; roomId: string }
  | { type: 'set-local-presence'; roomId: string; payload: unknown }
  | { type: 'update-peers'; roomId: string; peers: Record<string, unknown> }
  | { type: 'enqueue-broadcast'; roomId: string; topic: string; payload: unknown }
  | { type: 'incoming-broadcast'; roomId: string; topic: string; payload: unknown }
  | { type: 'leave-room'; roomId: string }
  | { type: 'mark-left'; roomId: string }
  | { type: 'drain-notifications' }
  | { type: 'noop' };

function emptyState(): PresenceActorState {
  return { rooms: {}, notifications: [] };
}

function ensureRoom(state: PresenceActorState, roomId: string): PresenceActorState {
  if (state.rooms[roomId]) return state;
  return {
    ...state,
    rooms: {
      ...state.rooms,
      [roomId]: {
        id: roomId,
        isConnected: false,
        joinRequested: false,
        pendingPresence: null,
        localPresence: null,
        peers: {},
        broadcastQueue: [],
      },
    },
  };
}

function pushNotification(
  state: PresenceActorState,
  notification: PresenceNotification,
): PresenceActorState {
  return {
    ...state,
    notifications: [...state.notifications, notification],
  };
}

export function createPresenceActor(options: PresenceActorOptions) {
  const actor = new Actor<PresenceEvent, PresenceActorState>({
    id: 'reactor/presence',
    initialState: emptyState(),
    reducer: (state, event, ctx) => {
      switch (event.type) {
        case 'ensure-room': {
          const existing = state.rooms[event.roomId];
          if (!existing) {
            const room: RoomState = {
              id: event.roomId,
              isConnected: false,
              joinRequested: true,
              pendingPresence: null,
              localPresence: null,
              peers: {},
              broadcastQueue: [],
            };
            const next: PresenceActorState = {
              ...state,
              rooms: {
                ...state.rooms,
                [event.roomId]: room,
              },
            };
            return pushNotification(next, {
              type: 'join-room',
              roomId: event.roomId,
            });
          }
          if (!existing.joinRequested) {
            const next: PresenceActorState = {
              ...state,
              rooms: {
                ...state.rooms,
                [event.roomId]: { ...existing, joinRequested: true },
              },
            };
            return pushNotification(next, {
              type: 'join-room',
              roomId: event.roomId,
            });
          }
          return state;
        }
        case 'mark-joined': {
          const room = state.rooms[event.roomId];
          if (!room) return state;
          const pendingPresence = room.pendingPresence;
          const queuedBroadcasts = [...room.broadcastQueue];
          const nextState: PresenceActorState = {
            ...state,
            rooms: {
              ...state.rooms,
              [event.roomId]: {
                ...room,
                isConnected: true,
                joinRequested: false,
                pendingPresence: null,
                broadcastQueue: [],
              },
            },
          };
          let result = nextState;
          if (pendingPresence !== null && pendingPresence !== undefined) {
            result = pushNotification(result, {
              type: 'send-presence',
              roomId: event.roomId,
              payload: pendingPresence,
            });
          }
          if (queuedBroadcasts.length > 0) {
            for (const item of queuedBroadcasts) {
              result = pushNotification(result, {
                type: 'broadcast',
                roomId: event.roomId,
                topic: item.topic,
                payload: item.payload,
              });
            }
          }
          return result;
        }
        case 'set-local-presence': {
          const existing = state.rooms[event.roomId];
          if (!existing) {
            options.logger.error('set-local-presence before ensuring room', event.roomId);
            return state;
          }
          const updatedRoom: RoomState = {
            ...existing,
            localPresence: event.payload,
            pendingPresence: existing.isConnected ? null : event.payload,
          };
          let next: PresenceActorState = {
            ...state,
            rooms: {
              ...state.rooms,
              [event.roomId]: updatedRoom,
            },
          };
          if (existing.isConnected) {
            next = pushNotification(next, {
              type: 'send-presence',
              roomId: event.roomId,
              payload: event.payload,
            });
          }
          return next;
        }
        case 'update-peers': {
          const room = state.rooms[event.roomId];
          if (!room) return state;
          const next: PresenceActorState = {
            ...state,
            rooms: {
              ...state.rooms,
              [event.roomId]: {
                ...room,
                peers: event.peers,
              },
            },
          };
          return pushNotification(next, {
            type: 'presence-updated',
            roomId: event.roomId,
            payload: event.peers,
          });
        }
        case 'enqueue-broadcast': {
          const room = state.rooms[event.roomId];
          if (!room) return state;
          if (room.isConnected) {
            return pushNotification(state, {
              type: 'broadcast',
              roomId: event.roomId,
              topic: event.topic,
              payload: event.payload,
            });
          }
          return {
            ...state,
            rooms: {
              ...state.rooms,
              [event.roomId]: {
                ...room,
                broadcastQueue: [
                  ...room.broadcastQueue,
                  { topic: event.topic, payload: event.payload },
                ],
              },
            },
          };
        }
        case 'incoming-broadcast': {
          return pushNotification(state, {
            type: 'incoming-broadcast',
            roomId: event.roomId,
            topic: event.topic,
            payload: event.payload,
          });
        }
        case 'leave-room': {
          const room = state.rooms[event.roomId];
          if (!room) return state;
          const nextRooms = { ...state.rooms };
          delete nextRooms[event.roomId];
          let result: PresenceActorState = {
            ...state,
            rooms: nextRooms,
          };
          if (room.isConnected) {
            result = pushNotification(result, {
              type: 'leave-room',
              roomId: event.roomId,
            });
          }
          return result;
        }
        case 'mark-left': {
          const room = state.rooms[event.roomId];
          if (!room) return state;
          const nextRooms = { ...state.rooms };
          delete nextRooms[event.roomId];
          return {
            ...state,
            rooms: nextRooms,
          };
        }
        case 'drain-notifications': {
          ctx.reply(state.notifications);
          return {
            ...state,
            notifications: [],
          };
        }
        case 'noop': {
          ctx.reply(state);
          return state;
        }
        default:
          return state;
      }
    },
  });

  return actor as ActorRef<PresenceEvent> & { snapshot: PresenceActorState };
}
