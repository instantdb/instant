import { Actor } from '../actors/core.ts';
import type { ActorRef } from '../actors/core.ts';
import type { PersistedStateRef, PersistedStateSnapshot } from '../storage/persistedState.ts';
import type { Scheduler } from '../types.ts';
import type { Logger } from '../../utils/log.ts';

export type MutationStatus = 'pending' | 'confirmed' | 'timeout' | 'error';

export interface MutationCacheEntry {
  eventId: string;
  steps: unknown[];
  status: MutationStatus;
  txId?: number;
  enqueuedAt: number;
  confirmedAt?: number;
  lastSentAt?: number;
  retries: number;
  order: number;
}

export interface MutationNotification {
  type: 'ack' | 'timeout' | 'error';
  eventId: string;
  txId?: number;
  error?: { message: string; hint?: unknown };
}

interface MutationActorState {
  hydrated: boolean;
  persisted: Record<string, MutationCacheEntry>;
  timers: Record<string, number | undefined>;
  orderCounter: number;
  notifications: MutationNotification[];
}

export interface MutationEnqueueRequest {
  eventId: string;
  steps: unknown[];
  enqueuedAt: number;
}

export interface MutationEnqueueResponse {
  entry: MutationCacheEntry;
}

export interface MutationActorOptions {
  persisted: PersistedStateRef<Record<string, MutationCacheEntry>>;
  scheduler: Scheduler;
  logger: Logger;
  defaultTimeoutMs: number;
}

type MutationEvent =
  | { type: 'hydrate' }
  | { type: 'enqueue'; payload: MutationEnqueueRequest }
  | { type: 'mark-sent'; eventId: string; timeoutMs?: number; now: number }
  | { type: 'ack'; eventId: string; txId: number; now: number }
  | { type: 'fail'; eventId: string; error: { message: string; hint?: unknown } }
  | { type: 'drop'; eventId: string }
  | { type: 'list-pending' }
  | { type: 'timeout'; eventId: string }
  | { type: 'drain-notifications' }
  | { type: 'noop' };

function emptyState(): MutationActorState {
  return {
    hydrated: false,
    persisted: {},
    timers: {},
    orderCounter: 0,
    notifications: [],
  };
}

async function ensureHydrated(
  state: MutationActorState,
  persisted: PersistedStateRef<Record<string, MutationCacheEntry>>,
): Promise<{ state: MutationActorState; snapshot: PersistedStateSnapshot<Record<string, MutationCacheEntry>> }>
{
  if (state.hydrated) {
    return {
      state,
      snapshot: {
        value: state.persisted,
        version: 0,
        hydrated: true,
      },
    };
  }
  const snapshot = await persisted.ask<PersistedStateSnapshot<Record<string, MutationCacheEntry>>>(
    { type: 'hydrate' },
  );
  const maxOrder = Math.max(0, ...Object.values(snapshot.value).map((entry) => entry.order));
  return {
    state: {
      ...state,
      hydrated: true,
      persisted: snapshot.value,
      orderCounter: maxOrder,
    },
    snapshot,
  };
}

async function updatePersisted(
  persisted: PersistedStateRef<Record<string, MutationCacheEntry>>,
  updater: (prev: Record<string, MutationCacheEntry>) => Record<string, MutationCacheEntry>,
): Promise<PersistedStateSnapshot<Record<string, MutationCacheEntry>>> {
  return persisted.ask<PersistedStateSnapshot<Record<string, MutationCacheEntry>>>(
    { type: 'set', updater },
  );
}

function sortedPending(entries: Record<string, MutationCacheEntry>): MutationCacheEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.status === 'pending')
    .sort((a, b) => a.order - b.order);
}

function pushNotification(
  state: MutationActorState,
  notification: MutationNotification,
): MutationActorState {
  return {
    ...state,
    notifications: [...state.notifications, notification],
  };
}

export function createMutationActor(options: MutationActorOptions) {
  const actor = new Actor<MutationEvent, MutationActorState>({
    id: 'reactor/mutation',
    initialState: emptyState(),
    reducer: async (state, event, ctx) => {
      switch (event.type) {
        case 'hydrate': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          ctx.reply(hydrated.persisted);
          return hydrated;
        }
        case 'enqueue': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          const { eventId, steps, enqueuedAt } = event.payload;
          if (hydrated.persisted[eventId]) {
            ctx.reply<MutationEnqueueResponse>({ entry: hydrated.persisted[eventId] });
            return hydrated;
          }
          const order = hydrated.orderCounter + 1;
          const entry: MutationCacheEntry = {
            eventId,
            steps,
            status: 'pending',
            enqueuedAt,
            retries: 0,
            order,
          };
          const snapshot = await updatePersisted(options.persisted, (prev) => ({
            ...prev,
            [eventId]: entry,
          }));
          ctx.reply<MutationEnqueueResponse>({ entry });
          return {
            ...hydrated,
            persisted: snapshot.value,
            orderCounter: order,
          };
        }
        case 'mark-sent': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          const entry = hydrated.persisted[event.eventId];
          if (!entry) return hydrated;
          const timeoutMs = event.timeoutMs ?? options.defaultTimeoutMs;
          if (hydrated.timers[event.eventId]) {
            options.scheduler.clearTimeout(hydrated.timers[event.eventId]!);
          }
          const timerId = options.scheduler.setTimeout(() => {
            ctx.self.send({ type: 'timeout', eventId: event.eventId });
          }, timeoutMs);
          const updated: MutationCacheEntry = {
            ...entry,
            status: 'pending',
            retries: entry.retries + 1,
            lastSentAt: event.now,
          };
          const snapshot = await updatePersisted(options.persisted, (prev) => ({
            ...prev,
            [event.eventId]: updated,
          }));
          return {
            ...hydrated,
            persisted: snapshot.value,
            timers: { ...hydrated.timers, [event.eventId]: timerId },
          };
        }
        case 'ack': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          const entry = hydrated.persisted[event.eventId];
          if (!entry) return hydrated;
          if (hydrated.timers[event.eventId]) {
            options.scheduler.clearTimeout(hydrated.timers[event.eventId]!);
          }
          const updated: MutationCacheEntry = {
            ...entry,
            status: 'confirmed',
            txId: event.txId,
            confirmedAt: event.now,
          };
          const snapshot = await updatePersisted(options.persisted, (prev) => ({
            ...prev,
            [event.eventId]: updated,
          }));
          const nextTimers = { ...hydrated.timers };
          delete nextTimers[event.eventId];
          return pushNotification(
            {
              ...hydrated,
              persisted: snapshot.value,
              timers: nextTimers,
            },
            { type: 'ack', eventId: event.eventId, txId: event.txId },
          );
        }
        case 'fail': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          if (hydrated.timers[event.eventId]) {
            options.scheduler.clearTimeout(hydrated.timers[event.eventId]!);
          }
          const snapshot = await updatePersisted(options.persisted, (prev) => {
            if (!prev[event.eventId]) return prev;
            const next = { ...prev };
            delete next[event.eventId];
            return next;
          });
          const nextTimers = { ...hydrated.timers };
          delete nextTimers[event.eventId];
          return pushNotification(
            {
              ...hydrated,
              persisted: snapshot.value,
              timers: nextTimers,
            },
            { type: 'error', eventId: event.eventId, error: event.error },
          );
        }
        case 'drop': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          if (hydrated.timers[event.eventId]) {
            options.scheduler.clearTimeout(hydrated.timers[event.eventId]!);
          }
          const snapshot = await updatePersisted(options.persisted, (prev) => {
            if (!prev[event.eventId]) return prev;
            const next = { ...prev };
            delete next[event.eventId];
            return next;
          });
          const nextTimers = { ...hydrated.timers };
          delete nextTimers[event.eventId];
          return {
            ...hydrated,
            persisted: snapshot.value,
            timers: nextTimers,
          };
        }
        case 'list-pending': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          ctx.reply(sortedPending(hydrated.persisted));
          return hydrated;
        }
        case 'timeout': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          const entry = hydrated.persisted[event.eventId];
          if (!entry || entry.status !== 'pending') return hydrated;
          const snapshot = await updatePersisted(options.persisted, (prev) => ({
            ...prev,
            [event.eventId]: { ...entry, status: 'timeout' },
          }));
          const nextTimers = { ...hydrated.timers };
          delete nextTimers[event.eventId];
          return pushNotification(
            {
              ...hydrated,
              persisted: snapshot.value,
              timers: nextTimers,
            },
            { type: 'timeout', eventId: event.eventId },
          );
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

  return actor as ActorRef<MutationEvent> & { snapshot: MutationActorState };
}
