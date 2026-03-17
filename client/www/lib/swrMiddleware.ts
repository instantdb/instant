import { useEffect, useMemo } from 'react';
import type { Middleware } from 'swr';
import { unstable_serialize, useSWRConfig } from 'swr';

type ServerOverrideAndTtlOptions = {
  ttlMinutes: number;
  timestampStorageKey?: string;
  disableFetchIfCached?: boolean;
};

const DEFAULT_TS_STORAGE_KEY = 'swr-cache-timestamps';

const getStoredTimestamps = (storageKey: string) => {
  try {
    const raw = localStorage.getItem(storageKey);
    return (raw ? JSON.parse(raw) : {}) as Record<string, number>;
  } catch {
    return {};
  }
};

// Set a max duration for cached values to be valid
export const serverOverrideAndTtl = ({
  ttlMinutes,
  disableFetchIfCached,
  timestampStorageKey = DEFAULT_TS_STORAGE_KEY,
}: ServerOverrideAndTtlOptions): Middleware => {
  return (useSWRNext) => {
    return (key, fetcher, config) => {
      const { cache } = useSWRConfig();

      const serializedKey = useMemo(() => {
        if (key == null) return null;
        return unstable_serialize(key);
      }, [key]);

      // If we have a fallback value, assume its from the server
      const serverFallbackValue = useMemo(() => {
        if (!serializedKey) return undefined;

        if (config?.fallbackData !== undefined) {
          return config.fallbackData;
        }

        return config?.fallback?.[serializedKey];
      }, [config?.fallback, config?.fallbackData, serializedKey]);

      if (typeof window !== 'undefined' && serializedKey) {
        // Delete from localstorage cache if we have a value from the server
        // so we don't get hydration errors
        if (serverFallbackValue !== undefined) {
          cache.delete(serializedKey);
        }

        if (Number.isFinite(ttlMinutes) && ttlMinutes > 0) {
          const ttlMs = ttlMinutes * 60 * 1000;
          const timestamps = getStoredTimestamps(timestampStorageKey);
          const ts = timestamps[serializedKey];

          if (typeof ts === 'number' && Date.now() - ts > ttlMs) {
            cache.delete(serializedKey);
          }
        }
      }

      if (serverFallbackValue && disableFetchIfCached) {
        fetcher = async () => serverFallbackValue;
      }

      const nextConfig =
        serverFallbackValue !== undefined
          ? { ...config, fallbackData: serverFallbackValue }
          : config;

      const swr = useSWRNext(key, fetcher, nextConfig);

      useEffect(() => {
        if (typeof window === 'undefined' || !serializedKey) return;

        if (disableFetchIfCached && serverFallbackValue) {
          // Don't update timestamp if we know that we aren't ever
          // fetching real data
          return;
        }

        const timestamps = getStoredTimestamps(timestampStorageKey);

        if (swr.data !== undefined) {
          timestamps[serializedKey] = Date.now();
          localStorage.setItem(timestampStorageKey, JSON.stringify(timestamps));
        }
      }, [serializedKey, swr.data, timestampStorageKey]);

      return swr;
    };
  };
};
