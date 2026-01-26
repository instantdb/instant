import { StoreInterface, StoreInterfaceStoreName } from '@instantdb/core';
import { createMMKV, MMKV } from 'react-native-mmkv';

export default class Store extends StoreInterface {
  _store: MMKV;
  constructor(appId: string, storeName: StoreInterfaceStoreName) {
    super(appId, storeName);
    this._store = createMMKV({
      id: `instant-${appId}-${storeName}`,
      readOnly: false,
      mode: 'multi-process',
    });
  }

  async getItem(k: string) {
    const item = this._store.getString(k);
    if (item) {
      return JSON.parse(item);
    }
    return null;
  }

  async setItem(k: string, v: any) {
    this._store.set(k, JSON.stringify(v));
  }

  async multiSet(keyValuePairs: Array<[string, any]>) {
    for (const [k, v] of keyValuePairs) {
      this.setItem(k, v);
    }
  }

  async removeItem(k: string) {
    this._store.remove(k);
  }

  async getAllKeys() {
    return this._store.getAllKeys();
  }
}
