export default class WindowNetworkListener {
  static async getIsOnline() {
    return navigator.onLine;
  }
  static listen(f) {
    const onOnline = () => {
      f(true);
    };
    const onOffline = () => {
      f(false);
    };
    addEventListener('online', onOnline);
    addEventListener('offline', onOffline);
    return () => {
      removeEventListener('online', onOnline);
      removeEventListener('offline', onOffline);
    };
  }
}
