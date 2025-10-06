export default class IndexedDBStorage {
  dbName: string;
  _storeName: string;
  _dbPromise: Promise<IDBDatabase>;

  constructor(dbName: string) {
    this.dbName = dbName;
    this._storeName = 'kv';
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
        resolve(target.result);
      };

      request.onupgradeneeded = (event) => {
        const target = event.target as IDBOpenDBRequest;
        const db = target.result;
        db.createObjectStore(this._storeName);
      };
    });
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
}
