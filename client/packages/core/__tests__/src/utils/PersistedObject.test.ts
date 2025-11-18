import 'fake-indexeddb/auto';
import { test, expect, describe } from 'vitest';
import { PersistedObject } from '../../../src/utils/PersistedObject';
import { IndexedDBStorage } from '../../../src';
import { randomUUID } from 'crypto';
import createLogger from '../../../src/utils/log';

async function idbSnapshot(idb, { includeMeta }) {
  const keys = await idb.getAllKeys();
  const res = {};
  for (const key of keys) {
    if (key === '__meta' && !includeMeta) {
      continue;
    }
    res[key] = await idb.getItem(key);
  }
  return res;
}

const devNullLogger = createLogger(false, () => ({}));

test('PersistedObject saves values to storage', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject<string, string, string>(
    idb,
    (_k, storage, memory) => storage || memory || 'none',
    (_k, x) => x,
    (_k, x) => x,
    (_v) => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  PO.updateInPlace((prev) => {
    prev.a = 'b';
  });

  await PO.flush();

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot).toStrictEqual({ a: 'b' });
});

test('PersistedObject merges existing values', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  let storageV;
  let memoryV;
  const PO = new PersistedObject<string, string, string>(
    idb,
    (_k, storage, memory) => {
      storageV = storage;
      memoryV = memory;
      return 'merged-value';
    },
    (_k, x) => x,
    (_k, x) => x,
    (_v) => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  PO.updateInPlace((prev) => {
    prev.a = 'b';
  });

  await PO.flush();

  expect(storageV).toBeNull();
  expect(memoryV).toEqual('b');
  expect(PO.currentValue.a).toEqual('merged-value');

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot).toStrictEqual({ a: 'merged-value' });

  let storageV2;
  let memoryV2;
  const PO2 = new PersistedObject<string, string, string>(
    idb,
    (_k, storage, memory) => {
      storageV2 = storage;
      memoryV2 = memory;
      return 'merged-value-2';
    },
    (_k, x) => x,
    (_k, x) => x,
    (_v) => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  PO2.updateInPlace((prev) => {
    prev.a = 'b';
  });

  await PO2.flush();

  expect(storageV2).toEqual('merged-value');
  expect(memoryV2).toEqual('b');
  expect(PO2.currentValue.a).toEqual('merged-value-2');

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot2).toStrictEqual({ a: 'merged-value-2' });
});

test('PersistedObject notifies you when it loads a key from storage', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject(
    idb,
    (_k, _storage, _memory) => 'merged',
    (_k, x) => x,
    (_k, x) => x,
    () => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );
});

test('PersistedObject garbage collects when we exceed max items', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject(
    idb,
    (_k, storage, memory) => storage || memory || 'new',
    (_k, x) => x,
    (_k, x) => x,
    () => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: 3,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  for (const [i, k] of Object.entries(['a', 'b', 'c', 'd', 'e'])) {
    PO.updateInPlace((prev) => {
      prev[k] = parseInt(i, 10) + 1;
    });
    await PO.flush();
  }

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  // We don't get rid of live keys
  expect(PO.currentValue).toStrictEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  expect(snapshot).toStrictEqual({
    a: 1,
    b: 2,
    c: 3,
    d: 4,
    e: 5,
  });

  PO.unloadKey('e');

  await PO.flush();

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 1, b: 2, c: 3, d: 4 });
  expect(snapshot2).toStrictEqual({ a: 1, b: 2, c: 3, d: 4 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject(
    idb,
    (_k, storage, memory) => storage || memory || 'new',
    (_k, x) => x,
    (_k, x) => x,
    () => 0,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: 3,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({ b: 2, c: 3, d: 4 });
});

test('PersistedObject garbage collects when we exceed max size', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject<string, number, number>(
    idb,
    (_k, storage, memory) => storage || memory || 0,
    (_k, x) => x,
    (_k, x) => x,
    (v) => v,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: 100,
      },
    },
  );

  for (const [i, k] of [
    [10, 'a'],
    [20, 'b'],
    [50, 'c'],
    [50, 'd'],
    [50, 'e'],
  ]) {
    PO.updateInPlace((prev) => {
      prev[k] = i as number;
    });
    await PO.flush();
  }

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  // We don't get rid of live keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50, e: 50 });
  expect(snapshot).toStrictEqual({
    a: 10,
    b: 20,
    c: 50,
    d: 50,
    e: 50,
  });

  PO.unloadKey('e');

  await PO.flush();

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });
  expect(snapshot2).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject<string, number, number>(
    idb,
    (_k, storage, memory) => storage || memory || 0,
    (_k, x) => x,
    (_k, x) => x,
    (v) => v,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: 100,
      },
    },
  );

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({ c: 50, d: 50 });
});

test('PersistedObject garbage collects when we exceed max age', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject<string, number, number>(
    idb,
    (_k, storage, memory) => storage || memory || 0,
    (_k, x) => x,
    (_k, x) => x,
    (v) => v,
    console,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: 0,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  for (const [i, k] of [
    [10, 'a'],
    [20, 'b'],
    [50, 'c'],
    [50, 'd'],
    [50, 'e'],
  ]) {
    PO.updateInPlace((prev) => {
      prev[k] = i as number;
    });
    console.time('Flush');
    await PO.flush();
    console.timeEnd('Flush');
  }

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  // We don't get rid of live keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50, e: 50 });
  expect(snapshot).toStrictEqual({
    a: 10,
    b: 20,
    c: 50,
    d: 50,
    e: 50,
  });

  PO.unloadKey('e');

  await PO.flush();

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });
  expect(snapshot2).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject<string, number, number>(
    idb,
    (_k, storage, memory) => storage || memory || 0,
    (_k, x) => x,
    (_k, x) => x,
    (v) => v,
    devNullLogger,
    {
      saveThrottleMs: 0,
      gc: {
        maxAgeMs: 0,
        maxEntries: Number.MAX_SAFE_INTEGER,
        maxSize: Number.MAX_SAFE_INTEGER,
      },
    },
  );

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({});
});
