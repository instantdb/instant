import {
  Meta,
  META_KEY,
  ObjectMeta,
  StorageInterface,
  StorageInterfaceStoreName,
} from './utils/PersistedObject.ts';

// Any time these are updates to the data format or new stores are added,
// the version must be updated.
// onupgradeneeded will be called, which is where you can
// move objects from one idb to another.
// We create a new IDB for each version change instead of
// using their built-in versioning because they have no ability
// to roll back and if multiple tabs are active, then you'll just
// be stuck.
const version = 6;

const storeNames = ['kv', 'querySubs', 'syncSubs'] as const;

// Check that we're not missing a store name in storeNames
type MissingStoreNames = Exclude<
  StorageInterfaceStoreName,
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

// We create many IndexedDBStorage instances that talk to the same
// underlying db, but we only get one `onupgradeneeded` event. This holds
// the upgrade promises so that we wait until upgrade finishes before
// we start writing.
const upgradePromises = new Map();

export default class IndexedDBStorage extends StorageInterface {
  dbName: string;
  _storeName: StorageInterfaceStoreName;
  _appId: string;
  _prefix: string;
  _dbPromise: Promise<IDBDatabase>;

  constructor(appId: string, storeName: StorageInterfaceStoreName) {
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
        reject(event);
      };

      request.onsuccess = (event) => {
        const target = event.target as IDBOpenDBRequest;
        const db = target.result;
        if (!requiresUpgrade) {
          const p = upgradePromises.get(this.dbName);
          if (!p) {
            resolve(db);
          } else {
            p.then(() => resolve(db)).catch(() => resolve(db));
          }
        } else {
          const p = upgrade5To6(this._appId, db).catch((e) => {
            logErrorCb('Error upgrading store from version 5 to 6.')(e);
          });
          upgradePromises.set(this.dbName, p);
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
  }

  async getItem(k: string): Promise<any> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this._storeName], 'readonly');
      const objectStore = transaction.objectStore(this._storeName);
      const request = objectStore.get(k);
      request.onerror = (event) => {
        reject(event);
      };
      request.onsuccess = (_event) => {
        if (request.result) {
          resolve(request.result);
        } else {
          resolve(null);
        }
      };
    });
  }

  async setItem(k: string, v: any): Promise<void> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this._storeName], 'readwrite');
      const objectStore = transaction.objectStore(this._storeName);
      const request = objectStore.put(v, k);

      request.onerror = (event) => {
        reject(event);
      };

      request.onsuccess = (_event) => {
        resolve();
      };
    });
  }

  // Performs all writes in a transaction so that all succeed or none succeed.
  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this._storeName], 'readwrite');
      const objectStore = transaction.objectStore(this._storeName);
      const requests: Set<IDBRequest<IDBValidKey>> = new Set();
      for (const [k, v] of keyValuePairs) {
        const request = objectStore.put(v, k);
        requests.add(request);
      }

      for (const request of requests) {
        request.onerror = (event) => {
          transaction.abort();
          reject(event);
        };
        request.onsuccess = (_event) => {
          requests.delete(request);
          // Last request to finish resolves the transaction
          if (requests.size === 0) {
            resolve();
          }
        };
      }
    });
  }

  async removeItem(k: string): Promise<void> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this._storeName], 'readwrite');
      const objectStore = transaction.objectStore(this._storeName);
      const request = objectStore.delete(k);
      request.onerror = (event) => {
        reject(event);
      };

      request.onsuccess = (_event) => {
        resolve();
      };
    });
  }

  async getAllKeys(): Promise<string[]> {
    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this._storeName], 'readonly');
      const objectStore = transaction.objectStore(this._storeName);
      const request = objectStore.getAllKeys();
      request.onerror = (event) => {
        reject(event);
      };
      request.onsuccess = (_event) => {
        resolve(request.result.filter((x) => typeof x === 'string'));
      };
    });
  }
}
