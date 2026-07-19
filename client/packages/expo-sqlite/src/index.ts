import { StoreInterface, StoreInterfaceStoreName } from '@instantdb/core';
import { SQLiteStorage } from 'expo-sqlite/kv-store';

export default class Store extends StoreInterface {
  _store: SQLiteStorage;
  constructor(appId: string, storeName: StoreInterfaceStoreName) {
    super(appId, storeName);
    this._store = new SQLiteStorage(`instant-${appId}-${storeName}`);
  }

  async getItem(k: string) {
    const item = await this._store.getItemAsync(k);
    if (item === null) {
      return null;
    }
    return JSON.parse(item);
  }

  async setItem(k: string, v: any) {
    await this._store.setItemAsync(k, JSON.stringify(v));
  }

  async multiSet(keyValuePairs: Array<[string, any]>) {
    await this._store.multiSet(
      keyValuePairs.map(([k, v]) => [k, JSON.stringify(v)]),
    );
  }

  async removeItem(k: string) {
    await this._store.removeItemAsync(k);
  }

  async getAllKeys() {
    return this._store.getAllKeysAsync();
  }
}
