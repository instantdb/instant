import { Actor, ActorRef } from '../actors/core.ts';
import type { PersistedObjectApi, PersistedValue, StorageDriver } from '../types.ts';

interface PersistedStateInternal<TValue> {
  value: TValue;
  version: number;
  hydrated: boolean;
  resource?: PersistedObjectApi<TValue>;
}

export interface PersistedStateOptions<TValue> {
  name: string;
  namespace: string;
  key: string;
  driver: StorageDriver;
  initialValue: TValue;
  merge?: (
    stored: PersistedValue<TValue> | undefined,
    inMemory: PersistedStateInternal<TValue>,
  ) => PersistedStateInternal<TValue>;
}

export type PersistedStateEvent<TValue> =
  | { type: 'hydrate' }
  | { type: 'get' }
  | { type: 'set'; updater: (prev: TValue) => TValue }
  | { type: 'replace'; value: TValue }
  | { type: 'flush' };

export interface PersistedStateSnapshot<TValue> {
  value: TValue;
  version: number;
  hydrated: boolean;
}

export type PersistedStateRef<TValue> = ActorRef<PersistedStateEvent<TValue>> & {
  getSnapshot(): PersistedStateSnapshot<TValue>;
};

function snapshotFromState<TValue>(
  state: PersistedStateInternal<TValue>,
): PersistedStateSnapshot<TValue> {
  return {
    value: state.value,
    version: state.version,
    hydrated: state.hydrated,
  };
}

async function ensureHydrated<TValue>(
  state: PersistedStateInternal<TValue>,
  options: PersistedStateOptions<TValue>,
): Promise<PersistedStateInternal<TValue>> {
  if (state.hydrated && state.resource) {
    return state;
  }

  const resource =
    state.resource ??
    (await options.driver.open<TValue>(options.namespace, options.key));
  const persisted = resource.get();

  if (options.merge) {
    const merged = options.merge(persisted, {
      value: state.value,
      version: persisted.version,
      hydrated: true,
      resource,
    });
    return { ...merged, resource };
  }

  const nextValue =
    persisted.value !== undefined ? persisted.value : options.initialValue;

  return {
    value: nextValue,
    version: persisted.version,
    hydrated: true,
    resource,
  };
}

export function createPersistedState<TValue>(
  options: PersistedStateOptions<TValue>,
): PersistedStateRef<TValue> {
  const actor = new Actor<PersistedStateEvent<TValue>, PersistedStateInternal<TValue>>({
    id: `storage/${options.name}`,
    initialState: {
      value: options.initialValue,
      version: 0,
      hydrated: false,
      resource: undefined,
    },
    reducer: async (state, event, ctx) => {
      switch (event.type) {
        case 'hydrate': {
          const hydrated = await ensureHydrated(state, options);
          ctx.reply(snapshotFromState(hydrated));
          return hydrated;
        }
        case 'get': {
          const hydrated = await ensureHydrated(state, options);
          ctx.reply(snapshotFromState(hydrated));
          return hydrated;
        }
        case 'set': {
          const hydrated = await ensureHydrated(state, options);
          if (!hydrated.resource) {
            throw new Error('Persisted state resource missing');
          }
          const nextValue = event.updater(hydrated.value);
          const persisted = hydrated.resource.set(() => nextValue);
          const nextState: PersistedStateInternal<TValue> = {
            value: nextValue,
            version: persisted.version,
            hydrated: true,
            resource: hydrated.resource,
          };
          ctx.reply(snapshotFromState(nextState));
          return nextState;
        }
        case 'replace': {
          const hydrated = await ensureHydrated(state, options);
          if (!hydrated.resource) {
            throw new Error('Persisted state resource missing');
          }
          const persisted = hydrated.resource.set(() => event.value);
          const nextState: PersistedStateInternal<TValue> = {
            value: event.value,
            version: persisted.version,
            hydrated: true,
            resource: hydrated.resource,
          };
          ctx.reply(snapshotFromState(nextState));
          return nextState;
        }
        case 'flush': {
          const hydrated = await ensureHydrated(state, options);
          hydrated.resource?.flush();
          return hydrated;
        }
        default:
          return state;
      }
    },
  });

  return Object.assign(actor, {
    getSnapshot: (): PersistedStateSnapshot<TValue> =>
      snapshotFromState(actor.snapshot),
  });
}
