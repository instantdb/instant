import { useContext, useEffect, useMemo } from 'react';
import { APIResponse, useAuthedFetch } from '../auth';
import config from '../config';
import { DashResponse } from '../types';
import { TokenContext } from '../contexts';
import useLocalStorage from './useLocalStorage';
import { subDays } from 'date-fns';

// FNV-1a algorithm
function stringHash(input: string) {
  let hash = 0x811c9dc5; // FNV offset basis (32 bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash = hash >>> 0; // Convert to unsigned 32-bit after each iteration
  }
  return hash.toString(16);
}

type CachedEntry<T> = {
  item: T;
  updatedAt: number;
};

export type CachedAPIResponse<T> = APIResponse<T> & { fromCache?: boolean };

export function useDashFetch(): CachedAPIResponse<DashResponse> {
  const now = new Date();
  const oneWeekAgo = subDays(now, 7).getTime();

  const token = useContext(TokenContext);
  const [cachedEntry, setCachedEntry] = useLocalStorage<
    CachedEntry<DashResponse> | undefined
  >(`dash:${stringHash(token || 'unk')}`, undefined);

  const item =
    cachedEntry && cachedEntry.updatedAt > oneWeekAgo
      ? cachedEntry.item
      : undefined;

  const dashResponse = useAuthedFetch<DashResponse>(`${config.apiURI}/dash`);
  useEffect(() => {
    if (dashResponse.data) {
      setCachedEntry({
        item: dashResponse.data,
        updatedAt: Date.now(),
      });
      return;
    }
    if (dashResponse.error) {
      setCachedEntry(undefined);
    }
  }, [dashResponse.data, dashResponse.error]);

  if (dashResponse.isLoading && cachedEntry && item) {
    return {
      ...dashResponse,
      isLoading: false,
      data: item,
      fromCache: true,
    };
  }

  return dashResponse;
}
