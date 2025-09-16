import type { PersistedObjectApi, StorageDriver } from '../types.ts';

interface Entry<T> {
  value: T;
  version: number;
  dirty: boolean;
}

type SeedValue =
  | unknown
  | {
      value: unknown;
      version?: number;
    };

export class InMemoryStorageDriver implements StorageDriver {
  private readonly store = new Map<string, Entry<unknown>>();

  constructor(initial?: Record<string, SeedValue>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        if (value && typeof value === 'object' && 'value' in value) {
          const record = value as { value: unknown; version?: number };
          this.store.set(key, {
            value: record.value,
            version: record.version ?? 0,
            dirty: false,
          });
        } else {
          this.store.set(key, { value, version: 0, dirty: false });
        }
      }
    }
  }

  async open<TValue>(
    namespace: string,
    key: string,
  ): Promise<PersistedObjectApi<TValue>> {
    const composedKey = `${namespace}:${key}`;
    if (!this.store.has(composedKey)) {
      this.store.set(composedKey, {
        value: undefined,
        version: 0,
        dirty: false,
      });
    }

    const entry = this.store.get(composedKey)! as Entry<TValue>;

    return {
      key,
      get: () => ({ value: entry.value, version: entry.version }),
      set: (updater) => {
        entry.value = updater(entry.value);
        entry.version += 1;
        entry.dirty = true;
        return { value: entry.value, version: entry.version };
      },
      flush: () => {
        entry.dirty = false;
      },
      isLoading: () => false,
    } satisfies PersistedObjectApi<TValue>;
  }
}
