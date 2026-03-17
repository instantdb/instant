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
import { useEffect, useRef, useState } from 'react';

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
  query: Q;
  opts?: InstaQLOptions;
}): InfiniteQueryResult<Schema, Q, UseDates> {
  const subRef = useRef<InfiniteQuerySubscription | null>(null);

  const initialSnapshot = useRef(
    getInfiniteQueryInitialSnapshot(core, query, opts),
  );

  const [state, setState] = useState<
    Omit<InfiniteQueryResult<Schema, Q, UseDates>, 'loadNextPage'>
  >({
    ...initialSnapshot.current,
    isLoading: !initialSnapshot.current.data,
  });

  useEffect(() => {
    // Ensure all data gets reset if the query/opts changes
    setState({
      error: undefined,
      data: undefined,
      isLoading: true,
      canLoadNextPage: false,
    });

    try {
      const sub = core.subscribeInfiniteQuery(
        query,
        (resp) => {
          setState({
            ...resp,
            isLoading: false,
          });
        },
        opts,
      );

      subRef.current = sub;

      return () => {
        subRef.current?.unsubscribe();
        subRef.current = null;
      };
    } catch (e) {
      setState({
        data: undefined,
        canLoadNextPage: false,
        error: { message: e instanceof Error ? e.message : String(e) },
        isLoading: false,
      });
    }
  }, [weakHash(query), weakHash(opts)]);

  const loadNextPage = () => {
    subRef.current?.loadNextPage();
  };

  // @ts-expect-error union type
  return {
    ...state,
    loadNextPage,
  };
}
