import { describe, expect, it } from 'vitest';
import { InMemoryStorageDriver } from './inMemoryDriver.ts';
import { createPersistedState } from './persistedState.ts';

interface CounterState {
  count: number;
}

describe('persisted state actor', () => {
  it('hydrates from storage and updates values', async () => {
    const driver = new InMemoryStorageDriver();
    const state = createPersistedState<CounterState>({
      name: 'counter',
      namespace: 'test',
      key: 'counter',
      driver,
      initialValue: { count: 0 },
    });

    const first = await state.ask<{ value: CounterState; version: number; hydrated: boolean }>(
      { type: 'hydrate' },
    );
    expect(first.value.count).toBe(0);
    expect(first.hydrated).toBe(true);

    const next = await state.ask<{ value: CounterState; version: number }>(
      {
        type: 'set',
        updater: (prev) => ({ count: prev.count + 1 }),
      },
    );
    expect(next.value.count).toBe(1);
    expect(next.version).toBe(1);

    const third = await state.ask<{ value: CounterState }>(
      { type: 'get' },
    );
    expect(third.value.count).toBe(1);
  });

  it('supports merge to combine stored data', async () => {
    const driver = new InMemoryStorageDriver({
      'test:counter': { value: { count: 5 }, version: 2, dirty: false },
    });

    const state = createPersistedState<CounterState>({
      name: 'counter',
      namespace: 'test',
      key: 'counter',
      driver,
      initialValue: { count: 0 },
      merge: (stored, current) => {
        return {
          value: {
            count: (stored?.value?.count ?? 0) + current.value.count,
          },
          version: stored?.version ?? current.version,
          hydrated: true,
          resource: current.resource,
        };
      },
    });

    const result = await state.ask<{ value: CounterState }>(
      { type: 'hydrate' },
    );
    expect(result.value.count).toBe(5);
  });
});
