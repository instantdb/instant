import { useCallback, useRef, useSyncExternalStore } from 'react';

function getSnapshot<T>(k: string): T | undefined {
  if (typeof window == 'undefined') return;
  let v = window.localStorage.getItem(k);
  if (!v) return;
  try {
    return JSON.parse(v);
  } catch (e) {}
}

function setItem<T>(k: string, v: T | undefined) {
  if (typeof window == 'undefined') {
    throw new Error('useLocalStorage/setState needs to run on the client');
  }
  const stringified = JSON.stringify(v);
  window.localStorage.setItem(k, stringified);
  // localStorage.setItem does not dispatch events to the current
  window.dispatchEvent(
    new StorageEvent('storage', { key: k, newValue: stringified }),
  );
}

export default function useLocalStorage<T>(
  k: string,
  defaultValue: T,
): [T, (v: T | undefined) => void] {
  const snapshotRef = useRef<T>(getSnapshot<T>(k) || defaultValue);
  const subscribe = useCallback((cb: Function) => {
    const listener = () => {
      snapshotRef.current = getSnapshot<T>(k) || defaultValue;
      cb();
    };
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('storage', listener);
    };
  }, []);
  const state = useSyncExternalStore<T>(
    subscribe,
    () => snapshotRef.current,
    () => defaultValue,
  );
  return [state, (v: T | undefined) => setItem<T>(k, v)];
}
