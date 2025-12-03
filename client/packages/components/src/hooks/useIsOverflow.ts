import { useLayoutEffect, useRef, useState } from 'react';

export function useIsOverflow() {
  const ref = useRef<any>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useLayoutEffect(() => {
    const { current } = ref;

    const trigger = () => {
      const hasOverflow =
        current.scrollWidth > current.clientWidth ||
        current.scrollHeight > current.clientHeight;

      setIsOverflow(hasOverflow);
    };

    if (current) {
      trigger();
    }
  }, [ref]);

  return { ref, isOverflow, setIsOverflow };
}
