import { RefObject, useEffect } from 'react';

export function useClickOutside(
  ref: RefObject<HTMLElement>,
  callback: () => void,
) {
  const handleClick = (e: MouseEvent) => {
    if (
      ref.current &&
      e.target instanceof HTMLElement &&
      !ref.current.contains(e.target)
    ) {
      callback();
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  });
}
