function isTauriEnv() {
  return (
    typeof window !== 'undefined' &&
    typeof window.__TAURI_INTERNALS__ !== 'undefined'
  );
}

export default class WindowNetworkListener {
  static async getIsOnline() {
    if (isTauriEnv()) {
      return true;
    }
    return navigator.onLine;
  }
  static listen(f) {
    if (isTauriEnv()) {
      return () => {};
    }
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
