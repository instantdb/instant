import { createActor, type ActorEffect } from './actor';
import { Deferred } from '../utils/Deferred.js';

type QueryCallback = { q: any; cb: (data: any) => void };

type QueryOnceRecord = {
  q: any;
  eventId: string;
  dfd: Deferred<any>;
};

interface QueryActorState {
  callbacks: Map<string, QueryCallback[]>;
  once: Map<string, QueryOnceRecord[]>;
}

type Message =
  | {
      type: 'add-listener';
      payload: {
        hash: string;
        record: QueryCallback;
        resolve: (result: { isFirstListener: boolean }) => void;
      };
    }
  | {
      type: 'remove-listener';
      payload: {
        hash: string;
        cb: (data: any) => void;
        resolve: (result: { remaining: number; once: number }) => void;
      };
    }
  | {
      type: 'add-once';
      payload: { hash: string; record: QueryOnceRecord };
    }
  | {
      type: 'resolve-once';
      payload: { hash: string; dfd: Deferred<any> };
    }
  | {
      type: 'reject-once';
      payload: { hash: string; eventId: string };
    }
  | {
      type: 'clear';
      payload: { hash: string };
    };

const emptyState: QueryActorState = {
  callbacks: new Map(),
  once: new Map(),
};

const cloneCallbacks = (callbacks: Map<string, QueryCallback[]>) =>
  new Map(callbacks);

const cloneOnce = (once: Map<string, QueryOnceRecord[]>) => new Map(once);

export interface QueryActorAPI {
  addListener(hash: string, record: QueryCallback): Promise<{ isFirstListener: boolean }>;
  removeListener(hash: string, cb: (data: any) => void): Promise<{ remaining: number; once: number }>;
  addOnce(hash: string, record: QueryOnceRecord): Promise<void>;
  resolveOnce(hash: string, dfd: Deferred<any>): Promise<void>;
  rejectOnce(hash: string, eventId: string): Promise<void>;
  clear(hash: string): Promise<void>;
  getCallbacks(hash: string): QueryCallback[];
  getOnce(hash: string): QueryOnceRecord[];
  hasListeners(hash: string): boolean;
  hasOnce(hash: string): boolean;
  hashesWithListeners(): string[];
  hashesWithOnce(): string[];
}

export function createQueryActor(): QueryActorAPI {
  const actor = createActor<QueryActorState, Message>({
    initialState: emptyState,
    async reducer(state, message) {
      switch (message.type) {
        case 'add-listener': {
          const { hash, record, resolve } = message.payload;
          const callbacks = cloneCallbacks(state.callbacks);
          const existing = callbacks.get(hash) ?? [];
          const next = [...existing, record];
          callbacks.set(hash, next);
          const effects: ActorEffect[] = [() => resolve({
              isFirstListener: existing.length === 0,
            })];
          return { state: { ...state, callbacks }, effects };
        }
        case 'remove-listener': {
          const { hash, cb, resolve } = message.payload;
          const callbacks = cloneCallbacks(state.callbacks);
          const existing = callbacks.get(hash) ?? [];
          const next = existing.filter((record) => record.cb !== cb);
          if (next.length) {
            callbacks.set(hash, next);
          } else {
            callbacks.delete(hash);
          }
          const once = state.once.get(hash) ?? [];
          const effects: ActorEffect[] = [() => resolve({
              remaining: next.length,
              once: once.length,
            })];
          return { state: { ...state, callbacks }, effects };
        }
        case 'add-once': {
          const { hash, record } = message.payload;
          const once = cloneOnce(state.once);
          const existing = once.get(hash) ?? [];
          once.set(hash, [...existing, record]);
          return { state: { ...state, once } };
        }
        case 'resolve-once': {
          const { hash, dfd } = message.payload;
          const once = cloneOnce(state.once);
          const existing = once.get(hash) ?? [];
          once.set(
            hash,
            existing.filter((record) => record.dfd !== dfd),
          );
          return { state: { ...state, once } };
        }
        case 'reject-once': {
          const { hash, eventId } = message.payload;
          const once = cloneOnce(state.once);
          const existing = once.get(hash) ?? [];
          once.set(
            hash,
            existing.filter((record) => record.eventId !== eventId),
          );
          return { state: { ...state, once } };
        }
        case 'clear': {
          const { hash } = message.payload;
          const callbacks = cloneCallbacks(state.callbacks);
          const once = cloneOnce(state.once);
          callbacks.delete(hash);
          once.delete(hash);
          return { state: { callbacks, once } };
        }
        default:
          return { state };
      }
    },
  });

  return {
    async addListener(hash, record) {
      return new Promise((resolve) => {
        actor.dispatch({
          type: 'add-listener',
          payload: { hash, record, resolve },
        });
      });
    },
    async removeListener(hash, cb) {
      return new Promise((resolve) => {
        actor.dispatch({
          type: 'remove-listener',
          payload: { hash, cb, resolve },
        });
      });
    },
    async addOnce(hash, record) {
      await actor.dispatch({
        type: 'add-once',
        payload: { hash, record },
      });
    },
    async resolveOnce(hash, dfd) {
      await actor.dispatch({
        type: 'resolve-once',
        payload: { hash, dfd },
      });
    },
    async rejectOnce(hash, eventId) {
      await actor.dispatch({
        type: 'reject-once',
        payload: { hash, eventId },
      });
    },
    async clear(hash) {
      await actor.dispatch({
        type: 'clear',
        payload: { hash },
      });
    },
    getCallbacks(hash) {
      return actor.getState().callbacks.get(hash) ?? [];
    },
    getOnce(hash) {
      return actor.getState().once.get(hash) ?? [];
    },
    hasListeners(hash) {
      return (actor.getState().callbacks.get(hash) ?? []).length > 0;
    },
    hasOnce(hash) {
      return (actor.getState().once.get(hash) ?? []).length > 0;
    },
    hashesWithListeners() {
      return Array.from(actor.getState().callbacks.keys());
    },
    hashesWithOnce() {
      return Array.from(actor.getState().once.keys());
    },
  };
}
