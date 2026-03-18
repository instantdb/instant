import {
  type InfiniteQuerySubscription,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  InstaQLResponse,
  ValidQuery,
  weakHash,
  getInfiniteQueryInitialSnapshot,
} from '@instantdb/core';
import { useCallback, useRef, useSyncExternalStore } from 'react';

export type InfiniteQueryResult<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> =
  | {
      error: { message: string };
      data: undefined;
      isLoading: false;
      canLoadNextPage: boolean;
      loadNextPage: () => void;
    }
  | {
      error: undefined;
      data: undefined;
      isLoading: true;
      canLoadNextPage: boolean;
      loadNextPage: () => void;
    }
  | {
      error: undefined;
      data: InstaQLResponse<Schema, Q, UseDates>;
      isLoading: false;
      canLoadNextPage: boolean;
      loadNextPage: () => void;
    };

export function useInfiniteQuerySubscription<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
>({
  core,
  query,
  opts,
}: {
  core: InstantCoreDatabase<Schema, UseDates>;
  query: Q | null;
  opts?: InstaQLOptions;
}): InfiniteQueryResult<Schema, Q, UseDates> {
  const subRef = useRef<InfiniteQuerySubscription | null>(null);

  const queryHash = weakHash(query);
  const optsHash = weakHash(opts);

  const snapshot = getInfiniteQueryInitialSnapshot(core, query, opts);

  const initialSnapshot = useRef<
    Omit<InfiniteQueryResult<Schema, Q, UseDates>, 'loadNextPage'>
  >({
    ...snapshot,
    isLoading: !snapshot.data && !snapshot.error,
  });

  const stateCacheRef = useRef<
    Omit<InfiniteQueryResult<Schema, Q, UseDates>, 'loadNextPage'>
  >(initialSnapshot.current);

  const serverSnapshotCacheRef = useRef(initialSnapshot.current);

  const subscribe = useCallback(
    (cb: () => void) => {
      subRef.current = null;
      stateCacheRef.current = {
        error: undefined,
        data: undefined,
        isLoading: true,
        canLoadNextPage: false,
      };
      cb();

      if (!query) {
        return () => {};
      }

      try {
        const sub = core.subscribeInfiniteQuery(
          query,
          (resp) => {
            stateCacheRef.current = {
              ...resp,
              isLoading: false,
            };
            cb();
          },
          opts,
        );

        subRef.current = sub;

        return () => {
          sub.unsubscribe();
          if (subRef.current === sub) {
            subRef.current = null;
          }
        };
      } catch (e) {
        stateCacheRef.current = {
          data: undefined,
          canLoadNextPage: false,
          error: { message: e instanceof Error ? e.message : String(e) },
          isLoading: false,
        };
        cb();

        return () => {};
      }
    },
    [queryHash, optsHash],
  );

  const state = useSyncExternalStore(
    subscribe,
    () => stateCacheRef.current,
    () => serverSnapshotCacheRef.current,
  );

  const loadNextPage = () => {
    subRef.current?.loadNextPage();
  };

  // @ts-expect-error union type
  return {
    ...state,
    loadNextPage,
  };
}
