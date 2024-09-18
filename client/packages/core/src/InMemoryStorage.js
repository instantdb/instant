export default class InMemoryStorage {
  constructor(dbName) {
    this.dbName = dbName;
    this.store = new Map();
  }

  async getItem(k) {
    return this.store.get(k) ?? null;
  }

  async setItem(k, v) {
    this.store.set(k, v);
  }
}
