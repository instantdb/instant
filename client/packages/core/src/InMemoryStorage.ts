import type { Storage } from './utils/PersistedObject.ts';

export default class InMemoryStorage implements Storage {
  private dbName: string;
  private store: Map<string, any>;
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

  async getAllKeys(): Promise<string[]> {
    return [...this.store.keys()];
  }

  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    for (const [k, v] of keyValuePairs) {
      this.setItem(k, v);
    }
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}
