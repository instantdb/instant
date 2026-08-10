import {
  Meta,
  META_KEY,
  ObjectMeta,
  StoreInterface,
  StoreInterfaceStoreName,
} from './utils/PersistedObject.ts';

// Any time these are updates to the data format or new stores are added,
// the version must be updated.
// onupgradeneeded will be called, which is where you can
// move objects from one idb to another.
// We create a new IDB for each version change instead of
// using their built-in versioning because they have no ability
// to roll back and if multiple tabs are active, then you'll just
// be stuck.
const version = 7;

const storeNames = ['kv', 'querySubs', 'syncSubs', 'mutations'] as const;

// Check that we're not missing a store name in storeNames
type MissingStoreNames = Exclude<
  StoreInterfaceStoreName,
  (typeof storeNames)[number]
>;
const _exhaustiveCheck: never = null as MissingStoreNames;

function logErrorCb(source: string) {
  return function logError(event) {
    console.error('Error in IndexedDB event', { source, event });
  };
}

async function existingDb(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);

    request.onerror = (_event) => {
      resolve(null);
    };

    request.onsuccess = (event) => {
      const target = event.target as IDBOpenDBRequest;
      const db = target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const target = event.target as IDBOpenDBRequest;
      target.transaction?.abort();
      resolve(null);
    };
  });
}

async function upgradeQuerySubs5To6(
  hash: string,
  value: any,
  querySubStore: IDBObjectStore,
): Promise<void> {
  const subs =
    // Backwards compatibility for older versions where we JSON.stringified before storing
    typeof value === 'string' ? JSON.parse(value) : value;
  if (!subs) {
    return;
  }
  const putReqs: Set<IDBRequest<IDBValidKey>> = new Set();
  return new Promise((resolve, reject) => {
    const objects = {};
    for (const [hash, v] of Object.entries(subs)) {
      const value = typeof v === 'string' ? JSON.parse(v) : v;
      if (value.lastAccessed) {
        const objectMeta: ObjectMeta = {
          createdAt: value.lastAccessed,
          updatedAt: value.lastAccessed,
          size: value.result?.store?.triples?.length ?? 0,
        };
        objects[hash] = objectMeta;
      }
      const putReq = querySubStore.put(value, hash);
      putReqs.add(putReq);
    }
    const meta: Meta<string> = { objects };
    const metaPutReq = querySubStore.put(meta, META_KEY);
    putReqs.add(metaPutReq);
    for (const r of putReqs) {
      r.onsuccess = () => {
        putReqs.delete(r);
        if (putReqs.size === 0) {
          resolve();
        }
      };
      r.onerror = (event) => {
        logErrorCb(`Move ${hash} to querySubs store failed`);
        reject(event);
      };
    }
  });
}

async function moveKvEntry5To6(
  k: string,
  value: any,
  kvStore: IDBObjectStore,
): Promise<void> {
  const request = kvStore.put(value, k);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event);
  });
}

async function upgrade5To6(appId: string, v6Db: IDBDatabase): Promise<void> {
  const v5db = await existingDb(`instant_${appId}_5`);
  if (!v5db) {
    return;
  }

  const data: Array<[string, any]> = await new Promise((resolve, reject) => {
    const v5Tx = v5db.transaction(['kv'], 'readonly');
    const objectStore = v5Tx.objectStore('kv');
    const cursorReq = objectStore.openCursor();
    cursorReq.onerror = (event) => {
      reject(event);
    };
    const data: Array<[string, any]> = [];
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const key = cursor.key as string;
        const value = cursor.value;
        data.push([key, value]);
        cursor.continue();
      } else {
        resolve(data);
      }
    };
    cursorReq.onerror = (event) => {
      reject(event);
    };
  });

  const v6Tx = v6Db.transaction(['kv', 'querySubs'], 'readwrite');

  const kvStore = v6Tx.objectStore('kv');
  const querySubStore = v6Tx.objectStore('querySubs');

  const promises: Promise<any>[] = [];
  const kvMeta: Meta<string> = { objects: {} };
  for (const [key, value] of data) {
    switch (key) {
      case 'querySubs': {
        const p = upgradeQuerySubs5To6(key, value, querySubStore);
        promises.push(p);
        break;
      }
      default: {
        const p = moveKvEntry5To6(key as string, value, kvStore);
        promises.push(p);
        const objectMeta: ObjectMeta = {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          size: 0,
        };
        kvMeta.objects[key] = objectMeta;
        break;
      }
    }
  }
  const p = moveKvEntry5To6(META_KEY, kvMeta, kvStore);
  promises.push(p);
  await Promise.all(promises);
  await new Promise((resolve, reject) => {
    v6Tx.oncomplete = (e) => resolve(e);
    v6Tx.onerror = (e) => reject(e);
    v6Tx.onabort = (e) => reject(e);
  });
}

async function readAllEntries(
  db: IDBDatabase,
  storeName: string,
): Promise<Array<[string, any]>> {
  if (!db.objectStoreNames.contains(storeName)) {
    return [];
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const cursorReq = tx.objectStore(storeName).openCursor();
    const data: Array<[string, any]> = [];
    cursorReq.onerror = (event) => {
      reject(event);
    };
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        data.push([cursor.key as string, cursor.value]);
        cursor.continue();
      } else {
        resolve(data);
      }
    };
  });
}

function parsePendingMutationsBlob(value: any): Array<[string, any]> {
  // Older clients stored the pending mutations map as `[...map.entries()]`,
  // and clients before version 6 JSON.stringified it first.
  const entries = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(entries) ? entries : [];
}

// Moves the single `pendingMutations` blob out of the kv store and into
// one row per mutation in the `mutations` store. Bounding each write to a
// single mutation keeps write transactions small, so a frozen tab can't
// park the kv lock mid-save and block sibling tabs.
async function splitPendingMutations(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(['kv', 'mutations'], 'readwrite');
  const kvStore = tx.objectStore('kv');
  const mutationStore = tx.objectStore('mutations');

  const blobReq = kvStore.get('pendingMutations');
  const metaReq = kvStore.get(META_KEY);
  blobReq.onsuccess = () => {
    const entries = blobReq.result
      ? parsePendingMutationsBlob(blobReq.result)
      : [];
    if (entries.length) {
      const meta: Meta<string> = { objects: {} };
      for (const [eventId, mutation] of entries) {
        mutationStore.put(mutation, eventId);
        meta.objects[eventId] = {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          size: 0,
        };
      }
      mutationStore.put(meta, META_KEY);
    }
    kvStore.delete('pendingMutations');
  };
  metaReq.onsuccess = () => {
    const kvMeta = metaReq.result;
    if (kvMeta?.objects?.pendingMutations) {
      delete kvMeta.objects.pendingMutations;
      kvStore.put(kvMeta, META_KEY);
    }
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
    tx.onabort = (e) => reject(e);
  });
}

async function upgrade6To7(appId: string, v7Db: IDBDatabase): Promise<void> {
  const v6Db = await existingDb(`instant_${appId}_6`);
  if (v6Db) {
    const stores = ['kv', 'querySubs', 'syncSubs'] as const;
    const entriesByStore: Array<[string, Array<[string, any]>]> = [];
    for (const storeName of stores) {
      entriesByStore.push([storeName, await readAllEntries(v6Db, storeName)]);
    }
    const tx = v7Db.transaction([...stores], 'readwrite');
    for (const [storeName, entries] of entriesByStore) {
      const store = tx.objectStore(storeName);
      for (const [key, value] of entries) {
        store.put(value, key);
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = (e) => resolve(e);
      tx.onerror = (e) => reject(e);
      tx.onabort = (e) => reject(e);
    });
  } else {
    // No version 6 db. If a version 5 db exists, bring its data over
    // first; it lands in the old shape with the pending mutations blob
    // in kv, which the split below moves to the mutations store.
    await upgrade5To6(appId, v7Db);
  }
  await splitPendingMutations(v7Db);
}

// We create many IndexedDBStorage instances that talk to the same
// underlying db, but we only get one `onupgradeneeded` event. This holds
// the upgrade promises so that we wait until upgrade finishes before
// we start writing.
const upgradePromises = new Map();

export default class IndexedDBStorage extends StoreInterface {
  dbName: string;
  _storeName: StoreInterfaceStoreName;
  _appId: string;
  _prefix: string;
  _dbPromise: Promise<IDBDatabase>;
  _resolveUpgradeDone: (() => void) | null = null;

  constructor(appId: string, storeName: StoreInterfaceStoreName) {
    super(appId, storeName);
    this.dbName = `instant_${appId}_${version}`;
    this._storeName = storeName;
    this._appId = appId;
    this._dbPromise = this._init();
  }

  _init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let requiresUpgrade = false;
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        // Unblock any siblings waiting on our upgrade
        this._resolveUpgradeDone?.();
        reject(event);
      };

      request.onsuccess = (event) => {
        const target = event.target as IDBOpenDBRequest;
        const db = target.result;
        // Browsers can close IndexedDB connections unexpectedly
        // (e.g. backgrounded tabs, memory pressure, version changes from
        // other tabs). Re-init so the next operation gets a fresh connection.
        db.onclose = () => {
          this._dbPromise = this._init();
        };
        db.onversionchange = () => {
          db.close();
        };
        if (!requiresUpgrade) {
          const p = upgradePromises.get(this.dbName);
          if (!p) {
            resolve(db);
          } else {
            p.then(() => resolve(db)).catch(() => resolve(db));
          }
        } else {
          const p = upgrade6To7(this._appId, db).catch((e) => {
            logErrorCb('Error upgrading store to version 7.')(e);
          });
          p.then(() => this._resolveUpgradeDone?.());
          p.then(() => resolve(db)).catch(() => resolve(db));
        }
      };

      request.onupgradeneeded = (event) => {
        requiresUpgrade = true;
        this._upgradeStore(event);
      };
    });
  }

  _upgradeStore(event: IDBVersionChangeEvent) {
    const target = event.target as IDBOpenDBRequest;
    const db = target.result;
    for (const storeName of storeNames) {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    }
    // Register the upgrade barrier now: `onupgradeneeded` runs before any
    // other connection's open can succeed, so every sibling instance is
    // guaranteed to find this promise and wait for the data migration that
    // runs in our `onsuccess`.
    const done = new Promise<void>((resolve) => {
      this._resolveUpgradeDone = resolve;
    });
    upgradePromises.set(this.dbName, done);
  }

  // Browsers can close IndexedDB connections unexpectedly (backgrounded tabs,
  // memory pressure, cross-tab version changes, etc.), causing
  // `db.transaction()` to throw InvalidStateError. This helper catches that
  // error and retries once with a fresh connection.
  async _withRetry<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    try {
      const db = await this._dbPromise;
      return await fn(db);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'InvalidStateError') {
        this._dbPromise = this._init();
        const db = await this._dbPromise;
        return await fn(db);
      }
      throw e;
    }
  }

  async getItem(k: string): Promise<any> {
    return this._withRetry((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this._storeName], 'readonly');
        const objectStore = transaction.objectStore(this._storeName);
        const request = objectStore.get(k);
        request.onerror = () => {
          reject(request.error);
        };
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result);
          } else {
            resolve(null);
          }
        };
      });
    });
  }

  async setItem(k: string, v: any): Promise<void> {
    return this._withRetry((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this._storeName], 'readwrite');
        const objectStore = transaction.objectStore(this._storeName);
        objectStore.put(v, k);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.commit?.();
      });
    });
  }

  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    return this._withRetry((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this._storeName], 'readwrite');
        const objectStore = transaction.objectStore(this._storeName);
        for (const [k, v] of keyValuePairs) {
          objectStore.put(v, k);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.commit?.();
      });
    });
  }

  async removeItem(k: string): Promise<void> {
    return this._withRetry((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this._storeName], 'readwrite');
        const objectStore = transaction.objectStore(this._storeName);
        objectStore.delete(k);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.commit?.();
      });
    });
  }

  async getAllKeys(): Promise<string[]> {
    return this._withRetry((db) => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this._storeName], 'readonly');
        const objectStore = transaction.objectStore(this._storeName);
        const request = objectStore.getAllKeys();
        request.onerror = () => {
          reject(request.error);
        };
        request.onsuccess = () => {
          resolve(request.result.filter((x) => typeof x === 'string'));
        };
      });
    });
  }
}
