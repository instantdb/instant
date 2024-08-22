import NetInfo from "@react-native-community/netinfo";

export default class NetworkListener {
  static async getIsOnline() {
    const network = await NetInfo.fetch();
    return network.isConnected;
  }
  static listen(f) {
    return NetInfo.addEventListener((state) => {
      console.log("connection change", state.isConnected);
      f(state.isConnected);
    });
  }
}
