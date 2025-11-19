import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageInterface, StorageInterfaceStoreName } from '@instantdb/core';

const version = 5;

export default class Storage extends StorageInterface {
  private appId: string;
  private dbName: StorageInterfaceStoreName;
  constructor(appId: string, dbName: StorageInterfaceStoreName) {
    super(appId, dbName);
    this.appId = appId;
    this.dbName = dbName;
  }

  private makeKey(k: string): string {
    return `instant_${this.appId}_${version}_${this.dbName}_${k}`;
  }

  async getItem(k) {
    const res = await AsyncStorage.getItem(this.makeKey(k));
    return JSON.parse(res);
  }

  async setItem(k, v) {
    await AsyncStorage.setItem(this.makeKey(k), JSON.stringify(v));
  }

  async removeItem(k: string): Promise<void> {
    await AsyncStorage.removeItem(this.makeKey(k));
  }

  async getAllKeys(): Promise<string[]> {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(`${this.dbName}_`));
  }

  async multiSet(keyValuePairs: Array<[string, any]>): Promise<void> {
    await AsyncStorage.multiSet(
      keyValuePairs.map(([k, v]) => [this.makeKey(k), JSON.stringify(v)]),
    );
  }
}
