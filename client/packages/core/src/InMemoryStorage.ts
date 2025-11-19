import {
  StorageInterface,
  StorageInterfaceStoreName,
} from './utils/PersistedObject.js';

export default class InMemoryStorage extends StorageInterface {
  private store: Map<string, any>;
  constructor(appId: string, dbName: StorageInterfaceStoreName) {
    super(appId, dbName);
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
