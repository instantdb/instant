import { Actor } from '../actors/core.ts';
import type { ActorRef } from '../actors/core.ts';
import type { PersistedStateRef, PersistedStateSnapshot } from '../storage/persistedState.ts';
import type { Logger } from '../../utils/log.ts';

export interface QueryResultEnvelope {
  store: unknown;
  pageInfo?: unknown;
  aggregate?: unknown;
  processedTxId?: number;
}

export interface QueryError {
  message: string;
  hint?: unknown;
}

export interface QueryCacheEntry {
  query: unknown;
  eventId: string;
  result?: QueryResultEnvelope;
  error?: QueryError | null;
  lastAccessed: number;
}

export interface QueryActorSnapshot {
  hydrated: boolean;
  persisted: Record<string, QueryCacheEntry>;
  revisions: Record<string, number>;
}

interface QueryOnceHandle {
  eventId: string;
  resolve: (data: QueryResultEnvelope) => void;
  reject: (error: QueryError) => void;
}

interface QueryActorState extends QueryActorSnapshot {
  listeners: Record<string, Record<string, true>>;
  once: Record<string, Map<string, QueryOnceHandle>>;
}

export interface QuerySubscribeRequest {
  hash: string;
  query: unknown;
  subscriberId: string;
  now: number;
}

export interface QuerySubscribeResponse {
  eventId: string;
  shouldFetch: boolean;
  cachedResult?: QueryResultEnvelope;
  error?: QueryError | null;
}

export interface QueryUnsubscribeRequest {
  hash: string;
  subscriberId: string;
}

export interface QueryUnsubscribeResponse {
  shouldRemove: boolean;
}

export interface QueryOnceRequest {
  hash: string;
  query: unknown;
  requestId: string;
  now: number;
  resolve: (data: QueryResultEnvelope) => void;
  reject: (error: QueryError) => void;
}

export interface QueryOnceResponse {
  eventId: string;
}

export interface QueryActorOptions {
  persisted: PersistedStateRef<Record<string, QueryCacheEntry>>;
  createEventId: () => string;
  logger: Logger;
  queryCacheLimit: number;
}

type QueryActorEvent =
  | { type: 'hydrate' }
  | { type: 'subscribe'; payload: QuerySubscribeRequest }
  | { type: 'unsubscribe'; payload: QueryUnsubscribeRequest }
  | { type: 'set-result'; hash: string; result: QueryResultEnvelope; now: number }
  | { type: 'set-error'; hash: string; error: QueryError | null; now: number }
  | { type: 'get'; hash: string }
  | { type: 'request-once'; payload: QueryOnceRequest }
  | { type: 'resolve-once'; hash: string; eventId: string; result: QueryResultEnvelope }
  | { type: 'reject-once'; hash: string; eventId: string; error: QueryError }
  | { type: 'evict'; hash: string }
  | { type: 'evict-stale'; limit: number }
  | { type: 'noop' };

function emptyState(): QueryActorState {
  return {
    hydrated: false,
    persisted: {},
    listeners: {},
    once: {},
    revisions: {},
  };
}

async function ensureHydrated(
  state: QueryActorState,
  persisted: PersistedStateRef<Record<string, QueryCacheEntry>>,
): Promise<{ state: QueryActorState; snapshot: PersistedStateSnapshot<Record<string, QueryCacheEntry>> }>
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
  const snapshot = await persisted.ask<PersistedStateSnapshot<Record<string, QueryCacheEntry>>>(
    { type: 'hydrate' },
  );
  return {
    state: {
      ...state,
      hydrated: true,
      persisted: snapshot.value,
    },
    snapshot,
  };
}

function cloneListeners(listeners: Record<string, Record<string, true>>): Record<string, Record<string, true>> {
  return Object.fromEntries(
    Object.entries(listeners).map(([hash, set]) => [hash, { ...set }]),
  );
}

function ensureListenerSet(
  listeners: Record<string, Record<string, true>>,
  hash: string,
): Record<string, true> {
  if (!listeners[hash]) listeners[hash] = {};
  return listeners[hash];
}

function ensureOnceMap(
  once: Record<string, Map<string, QueryOnceHandle>>,
  hash: string,
): Map<string, QueryOnceHandle> {
  if (!once[hash]) once[hash] = new Map();
  return once[hash];
}

async function updatePersisted(
  persisted: PersistedStateRef<Record<string, QueryCacheEntry>>,
  updater: (prev: Record<string, QueryCacheEntry>) => Record<string, QueryCacheEntry>,
): Promise<PersistedStateSnapshot<Record<string, QueryCacheEntry>>> {
  return persisted.ask<PersistedStateSnapshot<Record<string, QueryCacheEntry>>>(
    { type: 'set', updater },
  );
}

function evictOverflow(
  entries: Record<string, QueryCacheEntry>,
  limit: number,
): Record<string, QueryCacheEntry> {
  const keys = Object.keys(entries);
  if (keys.length <= limit) {
    return entries;
  }
  const sorted = [...keys].sort((a, b) => {
    const aTime = entries[a]?.lastAccessed ?? 0;
    const bTime = entries[b]?.lastAccessed ?? 0;
    return aTime - bTime;
  });
  const toRemove = sorted.slice(0, sorted.length - limit);
  const next = { ...entries };
  for (const key of toRemove) {
    delete next[key];
  }
  return next;
}

export function createQueryActor(options: QueryActorOptions) {
  const actor = new Actor<QueryActorEvent, QueryActorState>({
    id: 'reactor/query',
    initialState: emptyState(),
    reducer: async (state, event, ctx) => {
      switch (event.type) {
        case 'hydrate': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          ctx.reply(hydrated.persisted);
          return hydrated;
        }
        case 'subscribe': {
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          const { hash, query, subscriberId, now } = event.payload;
          const existing = hydrated.persisted[hash];
          let nextPersisted = hydrated.persisted;
          let entry = existing;
          let created = false;
          if (!entry) {
            entry = {
              query,
              eventId: options.createEventId(),
              result: undefined,
              error: null,
              lastAccessed: now,
            };
            const snapshot = await updatePersisted(options.persisted, (prev) => {
              const next = { ...prev, [hash]: entry! };
              return evictOverflow(next, options.queryCacheLimit);
            });
            nextPersisted = snapshot.value;
            entry = nextPersisted[hash];
            created = true;
          } else {
            entry = {
              ...entry,
              lastAccessed: now,
              query,
            };
            const snapshot = await updatePersisted(options.persisted, (prev) => ({
              ...prev,
              [hash]: entry!,
            }));
            nextPersisted = snapshot.value;
          }

          const listeners = { ...hydrated.listeners };
          const set = ensureListenerSet(listeners, hash);
          set[subscriberId] = true;

          const revisions = { ...hydrated.revisions };
          if (!(hash in revisions)) {
            revisions[hash] = 0;
          }

          ctx.reply<QuerySubscribeResponse>({
            eventId: entry!.eventId,
            shouldFetch: created || !entry!.result,
            cachedResult: entry!.result,
            error: entry!.error,
          });

          return {
            ...hydrated,
            persisted: nextPersisted,
            listeners,
            revisions,
          };
        }
        case 'unsubscribe': {
          const { hash, subscriberId } = event.payload;
          const listeners = { ...state.listeners };
          const set = { ...(listeners[hash] ?? {}) };
          delete set[subscriberId];
          if (Object.keys(set).length === 0) {
            delete listeners[hash];
          } else {
            listeners[hash] = set;
          }
          const remainingOnce = state.once[hash]?.size ?? 0;
          const shouldRemove = !listeners[hash] && remainingOnce === 0;
          if (shouldRemove) {
            const snapshot = await updatePersisted(options.persisted, (prev) => {
              if (!prev[hash]) return prev;
              const next = { ...prev };
              delete next[hash];
              return next;
            });
            ctx.reply<QueryUnsubscribeResponse>({ shouldRemove: true });
            return {
              ...state,
              persisted: snapshot.value,
              listeners,
            };
          }
          ctx.reply<QueryUnsubscribeResponse>({ shouldRemove: false });
          return {
            ...state,
            listeners,
          };
        }
        case 'set-result': {
          const { hash, result, now } = event;
          const snapshot = await updatePersisted(options.persisted, (prev) => {
            const current = prev[hash];
            if (!current) {
              options.logger.debug('set-result for unknown hash', hash);
              return prev;
            }
            return {
              ...prev,
              [hash]: {
                ...current,
                result,
                error: null,
                lastAccessed: now,
              },
            };
          });
          const revisions = { ...state.revisions, [hash]: (state.revisions[hash] ?? 0) + 1 };
          return {
            ...state,
            persisted: snapshot.value,
            revisions,
          };
        }
        case 'set-error': {
          const { hash, error, now } = event;
          const snapshot = await updatePersisted(options.persisted, (prev) => {
            const current = prev[hash];
            if (!current) return prev;
            return {
              ...prev,
              [hash]: {
                ...current,
                error,
                lastAccessed: now,
              },
            };
          });
          return {
            ...state,
            persisted: snapshot.value,
          };
        }
        case 'get': {
          const entry = state.persisted[event.hash];
          ctx.reply(entry);
          return state;
        }
        case 'request-once': {
          const { hash, query, requestId, now, resolve, reject } = event.payload;
          const { state: hydrated } = await ensureHydrated(state, options.persisted);
          let entry = hydrated.persisted[hash];
          let persistedValue = hydrated.persisted;
          if (!entry) {
            const snapshot = await updatePersisted(options.persisted, (prev) => {
              const created: QueryCacheEntry = {
                query,
                eventId: options.createEventId(),
                result: undefined,
                error: null,
                lastAccessed: now,
              };
              return { ...prev, [hash]: created };
            });
            persistedValue = snapshot.value;
            entry = persistedValue[hash];
          }
          const eventId = options.createEventId();
          const onceMap = new Map(hydrated.once[hash] ?? []);
          onceMap.set(requestId, {
            eventId,
            resolve,
            reject,
          });
          const nextOnce = { ...hydrated.once, [hash]: onceMap };
          ctx.reply<QueryOnceResponse>({ eventId });
          return {
            ...hydrated,
            persisted: persistedValue,
            once: nextOnce,
          };
        }
        case 'resolve-once': {
          const map = state.once[event.hash];
          if (!map) return state;
          const next = new Map(map);
          for (const [requestId, handle] of next.entries()) {
            if (handle.eventId === event.eventId) {
              handle.resolve(event.result);
              next.delete(requestId);
            }
          }
          const remaining = next.size;
          const once = { ...state.once };
          if (remaining === 0) {
            delete once[event.hash];
          } else {
            once[event.hash] = next;
          }
          return {
            ...state,
            once,
          };
        }
        case 'reject-once': {
          const map = state.once[event.hash];
          if (!map) return state;
          const next = new Map(map);
          for (const [requestId, handle] of next.entries()) {
            if (handle.eventId === event.eventId) {
              handle.reject(event.error);
              next.delete(requestId);
            }
          }
          const once = { ...state.once };
          if (next.size === 0) {
            delete once[event.hash];
          } else {
            once[event.hash] = next;
          }
          return {
            ...state,
            once,
          };
        }
        case 'evict': {
          const hash = event.hash;
          const snapshot = await updatePersisted(options.persisted, (prev) => {
            if (!prev[hash]) return prev;
            const next = { ...prev };
            delete next[hash];
            return next;
          });
          const listeners = { ...state.listeners };
          delete listeners[hash];
          const once = { ...state.once };
          delete once[hash];
          const revisions = { ...state.revisions };
          delete revisions[hash];
          return {
            ...state,
            persisted: snapshot.value,
            listeners,
            once,
            revisions,
          };
        }
        case 'evict-stale': {
          const snapshot = await updatePersisted(options.persisted, (prev) =>
            evictOverflow(prev, event.limit),
          );
          return {
            ...state,
            persisted: snapshot.value,
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

  return actor as ActorRef<QueryActorEvent> & { snapshot: QueryActorState };
}
