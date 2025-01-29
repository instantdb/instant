import AsyncStorage from '@react-native-async-storage/async-storage';

export default class Storage {
  constructor(dbName) {
    this.dbName = dbName;
  }

  async getItem(k) {
    return await AsyncStorage.getItem(`${this.dbName}_${k}`);
  }

  async setItem(k, v) {
    await AsyncStorage.setItem(`${this.dbName}_${k}`, v);
  }
}
