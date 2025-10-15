import { useEffect, useRef } from 'react';

export function useTimeout() {
  const timeoutRef = useRef(null);

  useEffect(() => {
    clear();
  }, []);

  function set(delay: number, fn: () => void) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(fn, delay);
  }

  function clear() {
    clearTimeout(timeoutRef.current);
  }

  return { set, clear };
}
