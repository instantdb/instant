import { StoreInterface, StoreInterfaceStoreName } from '@instantdb/core';

const version = 5;

// AsyncStorage is an optional peer dependency. When it's not installed we
// fall back to one of the alternative store packages below, or surface a
// helpful error from `init` if no store is available at all.
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

export class AsyncStorageStore extends StoreInterface {
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

class MissingStore extends StoreInterface {
  constructor(appId: string, dbName: StoreInterfaceStoreName) {
    super(appId, dbName);
    throw new Error(
      'Instant needs a store to persist data on device. ' +
        'Install `@react-native-async-storage/async-storage`, ' +
        'or one of the alternative stores (`@instantdb/react-native-mmkv`, `@instantdb/expo-sqlite`), ' +
        'or pass a custom `Store` to `init`.',
    );
  }

  async getItem(_k: string): Promise<any> {
    return null;
  }

  async removeItem(_k: string): Promise<void> {}

  async multiSet(_keyValuePairs: Array<[string, any]>): Promise<void> {}

  async getAllKeys(): Promise<string[]> {
    return [];
  }
}

// Each `require` below must sit directly inside a `try` block: that's what
// makes Metro treat it as an optional dependency
// (`transformer.allowOptionalDependencies`, enabled by default in the Expo
// and React Native metro configs), so bundling doesn't fail when one of
// these packages isn't installed.
function resolveDefaultStore() {
  if (AsyncStorage) {
    return AsyncStorageStore;
  }
  try {
    const mod = require('@instantdb/react-native-mmkv');
    return mod.default ?? mod;
  } catch {}
  try {
    const mod = require('@instantdb/expo-sqlite');
    return mod.default ?? mod;
  } catch {}
  return MissingStore;
}

export default resolveDefaultStore();
