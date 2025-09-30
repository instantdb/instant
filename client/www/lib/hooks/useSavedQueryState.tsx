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
  const [value, setValue] = useQueryState(queryKey, {
    ...params,
  });

  useEffect(() => {
    if (!value) {
      const saved = window.localStorage.getItem(localStorageKey);
      setValue(saved ? JSON.parse(saved) : defaultValue);
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
