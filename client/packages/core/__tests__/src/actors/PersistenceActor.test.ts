import { test, expect } from 'vitest';
import { PersistenceActor, Storage } from '../../../src/actors/PersistenceActor';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

test('PersistenceActor - registers and merges persisted objects', async () => {
  const storage = new MockStorage();
  const actor = new PersistenceActor(storage);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  let merged = false;
  actor.receive({
    type: 'persist:register',
    key: 'test-key',
    config: {
      defaultValue: { count: 0 },
      onMerge: (_storage, _memory) => {
        merged = true;
      },
    },
  });

  await actor.waitForLoaded();

  expect(merged).toBe(true);
  expect(messages.some((m) => m.type === 'persist:ready')).toBe(true);
});

test('PersistenceActor - sets and persists values', async () => {
  const storage = new MockStorage();
  const actor = new PersistenceActor(storage);

  actor.receive({
    type: 'persist:register',
    key: 'test-key',
    config: {
      defaultValue: { count: 0 },
      onMerge: () => {},
    },
  });

  await actor.waitForLoaded();

  actor.receive({
    type: 'persist:set',
    key: 'test-key',
    value: { count: 5 },
  });

  // Flush to storage
  actor.receive({ type: 'persist:flush', key: 'test-key' });

  // Value should be in storage
  const stored = await storage.getItem('test-key');
  expect(stored).toBeDefined();
  expect(JSON.parse(stored!)).toEqual({ count: 5 });
});

test('PersistenceActor - retrieves current values', async () => {
  const storage = new MockStorage();
  const actor = new PersistenceActor(storage);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'persist:register',
    key: 'test-key',
    config: {
      defaultValue: { count: 0 },
      onMerge: () => {},
    },
  });

  await actor.waitForLoaded();

  actor.receive({
    type: 'persist:set',
    key: 'test-key',
    value: { count: 10 },
  });

  actor.receive({
    type: 'persist:get',
    key: 'test-key',
  });

  const valueMsg = messages.find(
    (m) => m.type === 'persist:value' && m.key === 'test-key',
  );
  expect(valueMsg).toBeDefined();
  expect(valueMsg!.value).toEqual({ count: 10 });
});

test('PersistenceActor - flushes all objects on shutdown', async () => {
  const storage = new MockStorage();
  const actor = new PersistenceActor(storage);

  actor.receive({
    type: 'persist:register',
    key: 'key1',
    config: {
      defaultValue: { a: 1 },
      onMerge: () => {},
    },
  });

  actor.receive({
    type: 'persist:register',
    key: 'key2',
    config: {
      defaultValue: { b: 2 },
      onMerge: () => {},
    },
  });

  await actor.waitForLoaded();

  actor.receive({ type: 'persist:set', key: 'key1', value: { a: 10 } });
  actor.receive({ type: 'persist:set', key: 'key2', value: { b: 20 } });

  actor.shutdown();

  // Both should be flushed
  const stored1 = await storage.getItem('key1');
  const stored2 = await storage.getItem('key2');

  expect(JSON.parse(stored1!)).toEqual({ a: 10 });
  expect(JSON.parse(stored2!)).toEqual({ b: 20 });
});

test('PersistenceActor - publishes change events', async () => {
  const storage = new MockStorage();
  const actor = new PersistenceActor(storage);

  actor.receive({
    type: 'persist:register',
    key: 'test-key',
    config: {
      defaultValue: { count: 0 },
      onMerge: () => {},
    },
  });

  await actor.waitForLoaded();

  // Start collecting messages after load
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'persist:set',
    key: 'test-key',
    value: { count: 7 },
  });

  const changeMsg = messages.find(
    (m) => m.type === 'persist:changed' && m.key === 'test-key',
  );
  expect(changeMsg).toBeDefined();
  expect(changeMsg!.value).toEqual({ count: 7 });
});
