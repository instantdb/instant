import { useEffect, useState } from 'react';
import { localStorageFlagPrefix } from '../config';
import { flags } from '../flags';

/**
 * Custom hook to determine whether to display a feature.
 *
 * Depends on `lib/flags`.  If you want to create a new flag, add a new key to `flags`.
 * If the value of the new key is true, the feature will be displayed.  If it's false, the feature will not be displayed.
 *
 * For dev and demos, can bucket yourself into a feature by adding `&x_{FLAGNAME}` to the query string.
 * It'll persist to localStorage, so you'll still see the feature even if the query string changes.
 *
 * @param name - The name of the flag.
 * @returns - Whether the flag is active.
 */
export function useFlag(name: keyof typeof flags) {
  const [active, setActive] = useState<boolean>(flags[name] ?? false);

  useEffect(() => {
    const localStorageSavedFlag = Boolean(
      localStorage.getItem(`${localStorageFlagPrefix}${name}`)
    );

    if (localStorageSavedFlag) {
      setActive(true);
      return;
    }

    const url = new URL(location.href);
    const hasFlagParam = url.searchParams.has(`x_${name}`);

    if (hasFlagParam) {
      localStorage.setItem(`${localStorageFlagPrefix}${name}`, 'true');
      setActive(true);
    }
  }, []);

  return active;
}
