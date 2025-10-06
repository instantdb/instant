import AsyncStorage from '@react-native-async-storage/async-storage';

export default class Storage {
  constructor(dbName) {
    this.dbName = dbName;
  }

  async getItem(k) {
    const res = await AsyncStorage.getItem(`${this.dbName}_${k}`);
    return JSON.parse(res);
  }

  async setItem(k, v) {
    await AsyncStorage.setItem(`${this.dbName}_${k}`, JSON.stringify(v));
  }
}
