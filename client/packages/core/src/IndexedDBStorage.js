export default class IndexedDBStorage {
  constructor(dbName) {
    this.dbName = dbName;
    this._storeName = 'kv';
    this._dbPromise = this._init();
  }

  _init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        reject(event);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore(this._storeName);
      };
    });
  }

  async getItem(k) {
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

  async setItem(k, v) {
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
