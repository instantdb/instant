import { Actor } from '../actors/core.ts';
import type { ActorRef } from '../actors/core.ts';
import type { Scheduler, WebSocketCloseEvent, WebSocketLike } from '../types.ts';
import type { Logger } from '../utils/log.ts';
import type { NetworkStatus } from '../types.ts';

const enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface ConnectionActorOptions {
  logger: Logger;
  scheduler: Scheduler;
  createWebSocket: () => WebSocketLike;
  reconnectDelayMs?: (attempt: number) => number;
  id?: string;
}

export interface OutgoingPacket {
  id: number;
  payload: string;
}

export interface IncomingPacket {
  id: number;
  payload: string;
}

export interface ConnectionSnapshot {
  status: NetworkStatus;
  isOnline: boolean;
  socketId: number | null;
  reconnectAttempts: number;
  pending: OutgoingPacket[];
  inbox: IncomingPacket[];
  error?: { message: string } | null;
}

type ConnectionEvent =
  | { type: 'connect' }
  | { type: 'disconnect'; code?: number; reason?: string }
  | { type: 'set-online'; online: boolean }
  | { type: 'send'; payload: string }
  | { type: 'set-status'; status: NetworkStatus }
  | { type: 'socket-open'; socketId: number }
  | { type: 'socket-message'; socketId: number; payload: string }
  | { type: 'socket-close'; socketId: number; event: WebSocketCloseEvent }
  | { type: 'socket-error'; socketId: number; error: unknown }
  | { type: 'ack-message'; packetId: number }
  | { type: 'noop' };

interface ConnectionInternalState {
  status: NetworkStatus;
  isOnline: boolean;
  socket: WebSocketLike | null;
  socketId: number | null;
  reconnectAttempts: number;
  pending: OutgoingPacket[];
  inbox: IncomingPacket[];
  nextPacketId: number;
  error?: { message: string } | null;
  reconnectTimer: number | null;
  shouldReconnect: boolean;
}

let socketCounter = 0;
let packetCounter = 0;

function createPacket(payload: string): IncomingPacket {
  return { id: ++packetCounter, payload };
}

function defaultReconnectDelay(attempt: number): number {
  const capped = Math.min(attempt, 5);
  return 1000 * Math.pow(2, capped - 1); // 1s, 2s, 4s, ...
}

function attachSocketListeners(
  socket: WebSocketLike,
  actor: ActorRef<ConnectionEvent>,
  socketId: number,
) {
  const handleOpen = () => actor.send({ type: 'socket-open', socketId });
  const handleMessage = (event: { data: string }) =>
    actor.send({ type: 'socket-message', socketId, payload: event.data });
  const handleClose = (event: WebSocketCloseEvent) =>
    actor.send({ type: 'socket-close', socketId, event });
  const handleError = (error: unknown) =>
    actor.send({ type: 'socket-error', socketId, error });

  socket.addEventListener('open', handleOpen);
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', handleClose);
  socket.addEventListener('error', handleError);

  return () => {
    socket.removeEventListener('open', handleOpen);
    socket.removeEventListener('message', handleMessage);
    socket.removeEventListener('close', handleClose);
    socket.removeEventListener('error', handleError);
  };
}

function flushPending(state: ConnectionInternalState): void {
  if (!state.socket) return;
  if (state.socket.readyState !== ReadyState.OPEN) return;
  for (const item of state.pending) {
    state.socket.send(item.payload);
  }
  state.pending = [];
}

export function createConnectionActor(
  options: ConnectionActorOptions,
) {
  const actor = new Actor<ConnectionEvent, ConnectionInternalState>({
    id: options.id ?? 'network/connection',
    initialState: {
      status: 'connecting',
      isOnline: true,
      socket: null,
      socketId: null,
      reconnectAttempts: 0,
      pending: [],
      inbox: [],
      nextPacketId: 0,
      reconnectTimer: null,
      shouldReconnect: true,
      error: null,
    },
    reducer: async (state, event, ctx) => {
      switch (event.type) {
        case 'set-online': {
          const next: ConnectionInternalState = {
            ...state,
            isOnline: event.online,
            shouldReconnect: state.shouldReconnect && event.online,
          };
          if (event.online && !state.socket && state.shouldReconnect) {
            ctx.self.send({ type: 'connect' });
          }
          return next;
        }
        case 'set-status': {
          return { ...state, status: event.status };
        }
        case 'connect': {
          if (!state.isOnline) {
            options.logger.info('[network] offline, skipping connect');
            return { ...state, shouldReconnect: true };
          }
          if (state.socket && state.socket.readyState <= ReadyState.OPEN) {
            return state;
          }
          if (state.reconnectTimer) {
            options.scheduler.clearTimeout(state.reconnectTimer);
          }
          const socket = options.createWebSocket();
          const socketId = ++socketCounter;
          attachSocketListeners(socket, ctx.self, socketId);
          options.logger.info('[network] connecting socket', socketId);
          return {
            ...state,
            status: 'connecting',
            socket,
            socketId,
            reconnectAttempts: 0,
            reconnectTimer: null,
            shouldReconnect: true,
            error: null,
          };
        }
        case 'disconnect': {
          const { code, reason } = event;
          const socket = state.socket;
          state.reconnectTimer && options.scheduler.clearTimeout(state.reconnectTimer);
          if (socket && socket.readyState <= ReadyState.OPEN) {
            socket.close(code, reason);
          }
          return {
            ...state,
            socket: null,
            socketId: null,
            status: 'closed',
            reconnectTimer: null,
            shouldReconnect: false,
          };
        }
        case 'send': {
          if (state.socket && state.socket.readyState === ReadyState.OPEN) {
            state.socket.send(event.payload);
            return state;
          }
          const packetId = state.nextPacketId + 1;
          const packet: OutgoingPacket = {
            id: packetId,
            payload: event.payload,
          };
          return {
            ...state,
            nextPacketId: packetId,
            pending: [...state.pending, packet],
          };
        }
        case 'socket-open': {
          if (event.socketId !== state.socketId || !state.socket) return state;
          options.logger.info('[network] socket open', event.socketId);
          const next = { ...state, status: 'opened' };
          flushPending(next);
          return next;
        }
        case 'socket-message': {
          if (event.socketId !== state.socketId) return state;
          const packet = createPacket(event.payload);
          return {
            ...state,
            inbox: [...state.inbox, packet],
          };
        }
        case 'socket-error': {
          if (event.socketId !== state.socketId) return state;
          options.logger.error('[network] socket error', event.error);
          return state;
        }
        case 'socket-close': {
          if (event.socketId !== state.socketId) return state;
          options.logger.info('[network] socket closed', event.event);
          const shouldReconnect = state.shouldReconnect && state.isOnline;
          let reconnectTimer = state.reconnectTimer;
          let reconnectAttempts = state.reconnectAttempts;
          if (shouldReconnect) {
            reconnectAttempts += 1;
            const delay =
              options.reconnectDelayMs?.(reconnectAttempts) ??
              defaultReconnectDelay(reconnectAttempts);
            reconnectTimer = options.scheduler.setTimeout(() => {
              ctx.self.send({ type: 'connect' });
            }, delay);
          }
          return {
            ...state,
            status: shouldReconnect ? 'connecting' : 'closed',
            socket: null,
            socketId: null,
            reconnectAttempts,
            reconnectTimer,
            error: event.event.reason
              ? { message: event.event.reason }
              : state.error,
          };
        }
        case 'ack-message': {
          const remaining = state.inbox.filter(
            (packet) => packet.id !== event.packetId,
          );
          if (remaining.length === state.inbox.length) {
            return state;
          }
          return { ...state, inbox: remaining };
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

  return actor;
}
