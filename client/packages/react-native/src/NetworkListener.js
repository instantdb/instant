import NetInfo from '@react-native-community/netinfo';

export default class NetworkListener {
  static async getIsOnline() {
    const network = await NetInfo.fetch();
    return network.isConnected;
  }
  static listen(f) {
    return NetInfo.addEventListener((state) => {
      f(state.isConnected);
    });
  }
}
