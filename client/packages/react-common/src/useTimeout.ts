import { useEffect, useRef } from 'react';

export function useTimeout() {
  const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    clear();
  }, []);

  function set(delay: number, fn: () => void) {
    clear();
    timeoutRef.current = setTimeout(fn, delay);
  }

  function clear() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }

  return { set, clear };
}
