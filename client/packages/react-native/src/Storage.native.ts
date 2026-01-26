import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoreInterface, StoreInterfaceStoreName } from '@instantdb/core';

const version = 5;

export default class Store extends StoreInterface {
  private appId: string;
  private dbName: StoreInterfaceStoreName;
  constructor(appId: string, dbName: StoreInterfaceStoreName) {
    super(appId, dbName);
    this.appId = appId;
    this.dbName = dbName;
  }

  private makeKey(k: string): string {
    return `instant_${this.appId}_${version}_${this.dbName}_${k}`;
  }

  async getItem(k) {
    const res = await AsyncStorage.getItem(this.makeKey(k));
    if (res === null) return res;
    return JSON.parse(res);
  }

  async setItem(k, v) {
    await AsyncStorage.setItem(this.makeKey(k), JSON.stringify(v));
  }

  async removeItem(k: string): Promise<void> {
    await AsyncStorage.removeItem(this.makeKey(k));
  }

  async getAllKeys(): Promise<string[]> {
    const allKeys = await AsyncStorage.getAllKeys();
    const keys: string[] = [];
    const keyPrefix = this.makeKey('');
    for (const key of allKeys) {
      if (key.startsWith(keyPrefix)) {
        keys.push(key.substring(keyPrefix.length));
      }
    }
    return keys;
  }

  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    await AsyncStorage.multiSet(
      keyValuePairs.map(([k, v]) => [this.makeKey(k), JSON.stringify(v)]),
    );
  }
}
