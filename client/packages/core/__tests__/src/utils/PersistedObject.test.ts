import 'fake-indexeddb/auto';
import { test, expect, describe, vi } from 'vitest';
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
  const PO = new PersistedObject<string, string, string>({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 'none',
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (_v) => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

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
  const PO = new PersistedObject<string, string, string>({
    persister: idb,
    merge: (_k, storage, memory) => {
      storageV = storage;
      memoryV = memory;
      return 'merged-value';
    },
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (_v) => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

  PO.updateInPlace((prev) => {
    prev.a = 'b';
  });

  await PO.flush();

  // We don't run merge if there was nothing in the store
  expect(storageV).toBeUndefined();
  expect(memoryV).toBeUndefined();
  expect(PO.currentValue.a).toEqual('b');

  const snapshot = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot).toStrictEqual({ a: 'b' });

  let storageV2;
  let memoryV2;
  const PO2 = new PersistedObject<string, string, string>({
    persister: idb,
    merge: (_k, storage, memory) => {
      storageV2 = storage;
      memoryV2 = memory;
      return 'merged-value-2';
    },
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (_v) => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

  PO2.updateInPlace((prev) => {
    prev.a = 'c';
  });

  await PO2.flush();

  expect(storageV2).toEqual('b');
  expect(memoryV2).toEqual('c');
  expect(PO2.currentValue.a).toEqual('merged-value-2');

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot2).toStrictEqual({ a: 'merged-value-2' });
});

test('PersistedObject notifies you when it loads a key from storage', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject({
    persister: idb,
    merge: (_k, _storage, _memory) => 'merged',
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: () => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });
});

test('PersistedObject garbage collects when we exceed max items', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 'new',
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: () => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: 3,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

  for (const [i, k] of Object.entries(['a', 'b', 'c', 'd', 'e'])) {
    PO.updateInPlace((prev) => {
      prev[k] = parseInt(i, 10) + 1;
    });
    await PO.flush();
  }

  // @ts-expect-error: allow access to private fields for test
  await PO._gc();
  await PO.flush();

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
  await PO.flush();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 1, b: 2, c: 3, d: 4 });
  expect(snapshot2).toStrictEqual({ a: 1, b: 2, c: 3, d: 4 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 'new',
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: () => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: 3,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  await PO2.flush();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({ b: 2, c: 3, d: 4 });
});

test('PersistedObject garbage collects when we exceed max size', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject<string, number, number>({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 0,
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (v) => v,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: 100,
    },
  });

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
  await PO.flush();

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
  await PO.flush();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });
  expect(snapshot2).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject<string, number, number>({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 0,
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (v) => v,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: Number.MAX_SAFE_INTEGER,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: 100,
    },
  });

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  await PO.flush();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({ c: 50, d: 50 });
});

test('PersistedObject garbage collects when we exceed max age', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'querySubs');
  const PO = new PersistedObject<string, number, number>({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 0,
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (v) => v,
    logger: createLogger(true, () => ({})),
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: 0,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

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
  await PO.flush();

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

  await PO.flush();

  const snapshot2 = await idbSnapshot(idb, { includeMeta: false });

  // It does get rid of unloaded keys
  expect(PO.currentValue).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });
  expect(snapshot2).toStrictEqual({ a: 10, b: 20, c: 50, d: 50 });

  // Simulate a reload of the page
  const PO2 = new PersistedObject<string, number, number>({
    persister: idb,
    merge: (_k, storage, memory) => storage || memory || 0,
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: (v) => v,
    logger: devNullLogger,
    saveThrottleMs: 0,
    gc: {
      maxAgeMs: 0,
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
  });

  await PO2.waitForMetaToLoad();

  // @ts-expect-error: allow access to private fields for test
  await PO2._gc();
  await PO2.flush();
  const snapshot3 = await idbSnapshot(idb, { includeMeta: false });

  expect(snapshot3).toStrictEqual({});
});

test('IndexedDBStorage recovers when the database connection closes', async () => {
  const idb = new IndexedDBStorage(randomUUID(), 'kv');

  await idb.setItem('key1', 'value1');
  expect(await idb.getItem('key1')).toBe('value1');

  // Simulate the browser closing the connection unexpectedly.
  // Remove the onclose handler so recovery relies entirely on _withRetry
  // catching the InvalidStateError (the same codepath as the original bug).
  const db = await idb._dbPromise;
  db.onclose = null;
  db.close();

  // All operations should recover transparently
  await idb.setItem('key2', 'value2');
  expect(await idb.getItem('key1')).toBe('value1');
  expect(await idb.getItem('key2')).toBe('value2');

  await idb.multiSet([
    ['key3', 'value3'],
    ['key4', 'value4'],
  ]);
  expect(await idb.getItem('key3')).toBe('value3');
  expect(await idb.getItem('key4')).toBe('value4');

  const keys = await idb.getAllKeys();
  expect(keys.sort()).toStrictEqual(['key1', 'key2', 'key3', 'key4']);

  await idb.removeItem('key4');
  expect(await idb.getItem('key4')).toBe(null);
});

test('IndexedDBStorage explicitly commits write transactions', async () => {
  const commitSpy = vi.spyOn(IDBTransaction.prototype, 'commit');
  try {
    const idb = new IndexedDBStorage(randomUUID(), 'kv');

    await idb.setItem('key1', 'value1');
    await idb.multiSet([
      ['key2', 'value2'],
      ['key3', 'value3'],
    ]);
    await idb.removeItem('key3');

    expect(commitSpy).toHaveBeenCalledTimes(3);
    expect(await idb.getItem('key1')).toBe('value1');
    expect(await idb.getItem('key2')).toBe('value2');
    expect(await idb.getItem('key3')).toBe(null);
  } finally {
    commitSpy.mockRestore();
  }
});

test('IndexedDBStorage rejects cleanly when indexedDB is undefined or open result is missing', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  try {
    // @ts-expect-error: simulate restricted WebView without indexedDB global
    delete globalThis.indexedDB;
    const idbMissing = new IndexedDBStorage(randomUUID(), 'kv');
    await expect(idbMissing.getItem('key1')).rejects.toThrow(
      /IndexedDB is not available/,
    );
  } finally {
    globalThis.indexedDB = originalIndexedDB;
  }

  const openSpy = vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(
    () => {
      const fakeReq: any = {};
      queueMicrotask(() => {
        fakeReq.onupgradeneeded?.({ target: { result: undefined } });
        fakeReq.onsuccess?.({ target: { result: undefined } });
      });
      return fakeReq;
    },
  );
  try {
    const idbNullResult = new IndexedDBStorage(randomUUID(), 'kv');
    await expect(idbNullResult.getItem('key1')).rejects.toThrow(
      /IndexedDB open succeeded without a database instance/,
    );
  } finally {
    openSpy.mockRestore();
  }
});

test('PersistedObject handles failing storage without unhandled rejections or infinite retry loops', async () => {
  const failingPersister = {
    getItem: () => Promise.reject(new Error('IDB blocked')),
    removeItem: () => Promise.reject(new Error('IDB blocked')),
    multiSet: () => Promise.reject(new Error('IDB blocked')),
    getAllKeys: () => Promise.reject(new Error('IDB blocked')),
  };

  const PO = new PersistedObject<string, string, string>({
    persister: failingPersister,
    merge: (_k, storage, memory) => storage || memory || 'none',
    serialize: (_k, x) => x,
    parse: (_k, x) => x,
    objectSize: () => 0,
    logger: devNullLogger,
    saveThrottleMs: 0,
    preloadEntryCount: 5,
    gc: null,
  });

  expect(await PO.waitForMetaToLoad()).toBeNull();

  PO.updateInPlace((prev) => {
    prev.a = 'b';
  });
  expect(PO.currentValue.a).toBe('b');

  // With meta load failed and isLoading=false, flush resolves to 0 immediately
  // instead of looping in _writeToStorage retry timeouts.
  expect(await PO.flush()).toBe(0);
});
