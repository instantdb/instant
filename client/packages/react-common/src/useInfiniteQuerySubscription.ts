import {
  type InfiniteQuerySubscription,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  InstaQLResponse,
  ValidQuery,
  weakHash,
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
      canLoadMore: boolean;
      loadMore: () => void;
    }
  | {
      error: undefined;
      data: undefined;
      isLoading: true;
      canLoadMore: boolean;
      loadMore: () => void;
    }
  | {
      error: undefined;
      data: InstaQLResponse<Schema, Q, UseDates>;
      isLoading: false;
      canLoadMore: boolean;
      loadMore: () => void;
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
  const [state, setState] = useState<
    Omit<InfiniteQueryResult<Schema, Q, UseDates>, 'loadMore'>
  >({
    error: undefined,
    data: undefined,
    isLoading: true,
    canLoadMore: false,
  });

  useEffect(() => {
    // Ensure all data gets reset if the query/opts changes
    setState({
      error: undefined,
      data: undefined,
      isLoading: true,
      canLoadMore: false,
    });

    try {
      const sub = core.subscribeInfiniteQuery(
        query,
        (resp) => {
          if (resp.error) {
            setState({
              data: undefined,
              canLoadMore: false,
              error: resp.error,
              isLoading: false,
            });
          } else {
            setState({
              data: resp.data,
              canLoadMore: resp.canLoadMore || false,
              error: resp.error,
              isLoading: false,
            });
          }
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
        canLoadMore: false,
        error: { message: e instanceof Error ? e.message : String(e) },
        isLoading: false,
      });
    }
  }, [weakHash(query), weakHash(opts)]);

  const loadMore = () => {
    subRef.current?.loadMore();
  };

  // @ts-expect-error union type
  return {
    ...state,
    loadMore,
  };
}
