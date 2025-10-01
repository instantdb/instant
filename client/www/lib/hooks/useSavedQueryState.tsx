import { debounce } from 'lodash';
import { useQueryState, UseQueryStateOptions, UseQueryStateReturn } from 'nuqs';
import { useCallback, useEffect } from 'react';

export const useSavedQueryState = <
  T extends string | boolean | number = string,
>(
  queryKey: string,
  params: UseQueryStateOptions<T>,
  localStorageKey: string,
  defaultValue?: T,
  debounceTime = 300,
): UseQueryStateReturn<NonNullable<T>, T> => {
  const loadedDefault = window.localStorage.getItem(localStorageKey)
    ? JSON.parse(window.localStorage.getItem(localStorageKey)!)
    : defaultValue;

  const [value, setValue] = useQueryState(queryKey, {
    ...params,
    defaultValue: loadedDefault,
    clearOnDefault: false,
  });

  // The "clear on default" option only applies to
  // subsequent updates that set it BACK to the default
  // This puts the query param the in the default case on first render
  useEffect(() => {
    if (value === loadedDefault) {
      setValue(loadedDefault);
    }
  }, []);

  const debouncedSaveFn = useCallback(
    debounce((value: T) => {
      window.localStorage.setItem(localStorageKey, JSON.stringify(value));
    }, debounceTime),
    [localStorageKey, debounceTime],
  );

  useEffect(
    function saveSandboxCode() {
      if (value !== null) {
        debouncedSaveFn(value);
      }
    },
    [value, debouncedSaveFn],
  );

  return [value, setValue] as any;
};
