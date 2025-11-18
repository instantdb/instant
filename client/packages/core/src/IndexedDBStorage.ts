import type { Storage } from './utils/PersistedObject.ts';

type StoreName = 'kv' | 'querySubs';

// Any time these are updates to the data format or new stores are added,
// the version must be updated.
// onupgradeneeded will be called, which is where you can
// move objects from one idb to another.
// We create a new IDB for each version change instead of
// using their built-in versioning because they have no ability
// to roll back and if multiple tabs are active, then you'll just
// be stuck.
const version = 6;
const storeNames = ['kv', 'querySubs'];

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
      target.transaction.abort();
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
    for (const [hash, value] of Object.entries(subs)) {
      const putReq = querySubStore.put(value, hash);
      putReqs.add(putReq);
    }
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

async function moveKv5To6(
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

async function upgrade5To6(appId: string, v5Tx: IDBTransaction): Promise<void> {
  const v4db = await existingDb(`instant_${appId}_4`);
  if (!v4db) {
    return;
  }

  const kvStore = v5Tx.objectStore('kv');
  const querySubStore = v5Tx.objectStore('querySubs');

  return new Promise((resolve, reject) => {
    const v4Tx = v4db.transaction(['kv'], 'readwrite');
    const objectStore = v4Tx.objectStore('kv');
    const cursorReq = objectStore.openCursor();
    cursorReq.onerror = (event) => {
      reject(event);
    };
    const promises = [];
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const key = cursor.key;
        const value = cursor.value;
        switch (key) {
          case 'querySubs': {
            const p = upgradeQuerySubs5To6(key, value, querySubStore);
            promises.push(p);
            break;
          }
          default: {
            const p = moveKv5To6(key as string, value, kvStore);
            promises.push(p);
            break;
          }
        }
      } else {
        Promise.all(promises)
          .then(() => resolve())
          .catch(reject);
      }
    };
  });
}

export default class IndexedDBStorage implements Storage {
  dbName: string;
  _storeName: string;
  _appId: string;
  _prefix: string;
  _dbPromise: Promise<IDBDatabase>;

  constructor(appId: string, storeName: StoreName) {
    this.dbName = `instant_${appId}_${version}`;
    this._storeName = storeName;
    this._appId = appId;
    this._dbPromise = this._init();
  }

  _init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        reject(event);
      };

      request.onsuccess = (event) => {
        const target = event.target as IDBOpenDBRequest;
        const db = target.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => this._upgradeStore(event);
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
    const tx = target.transaction;
    upgrade5To6(this._appId, tx);
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
      const transaction = db.transaction([this._storeName], 'readwrite');
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
