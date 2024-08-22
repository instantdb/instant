export default class WindowNetworkListener {
  static async getIsOnline() {
    return window.navigator.onLine;
  }
  static listen(f) {
    const onOnline = () => {
      f(true);
    };
    const onOffline = () => {
      f(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }
}
