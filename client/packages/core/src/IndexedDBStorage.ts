import type { Storage } from './utils/PersistedObject.ts';

type StoreName = 'kv' | 'querySubs';
const version = 2;
// Any time these are updated, the version must be updated
// onupgradeneeded will be called, which is where you can
// move objects from one store to another.
const storeNames = ['kv', 'querySubs'];

function logErrorCb(source: string) {
  return function logError(event) {
    console.error('Error in IndexedDB event', { source, event });
  };
}

export default class IndexedDBStorage implements Storage {
  dbName: string;
  _storeName: string;
  _prefix: string;
  _dbPromise: Promise<IDBDatabase>;

  constructor(dbName: string, storeName: StoreName) {
    this.dbName = dbName;
    this._storeName = storeName;
    this._dbPromise = this._init();
  }

  _init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, version);

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

  // Moves query subs from the kv store to the querySubs store
  _moveQuerySubsToObjectStore(tx: IDBTransaction) {
    const kvStore = tx.objectStore('kv');
    const querySubStore = tx.objectStore('querySubs');
    const req = kvStore.get('querySubs');
    req.onerror = logErrorCb('get querySubs from kv store failed');
    req.onsuccess = (_) => {
      const subs =
        // Backwards compatibility for older versions where we JSON.stringified before storing
        typeof req.result === 'string' ? JSON.parse(req.result) : req.result;
      if (!subs) {
        return;
      }
      const putReqs: Set<IDBRequest<IDBValidKey>> = new Set();
      for (const [hash, value] of Object.entries(subs)) {
        const putReq = querySubStore.put(value, hash);
        putReq.onerror = logErrorCb(`Move ${hash} to querySubs store failed`);
        putReqs.add(putReq);
      }
      for (const r of putReqs) {
        r.onsuccess = () => {
          putReqs.delete(r);
          if (putReqs.size === 0) {
            const deletedReq = kvStore.delete('querySubs');
            deletedReq.onerror = logErrorCb(
              'Cleanup querySubs from kv store failed',
            );
          }
        };
      }
    };
  }

  _upgradeStore(event: IDBVersionChangeEvent) {
    const target = event.target as IDBOpenDBRequest;
    const db = target.result;
    const created = new Set();
    for (const storeName of storeNames) {
      if (!db.objectStoreNames.contains(storeName)) {
        created.add(storeName);
        db.createObjectStore(storeName);
      }
    }
    if (created.has('querySubs') && !created.has('kv')) {
      const tx = target.transaction;
      this._moveQuerySubsToObjectStore(tx);
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
