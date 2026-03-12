import {
  Cursor,
  InfiniteQueryCallbackResponse,
  type InfiniteQuerySubscription,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  InstaQLResponse,
  ValidQuery,
  weakHash,
} from '@instantdb/core';
import { useEffect, useRef, useState } from 'react';

export type ChunkStatus = 'bootstrapping' | 'frozen';

export interface Chunk {
  status: ChunkStatus;
  data: any[];
  hasMore?: boolean;
  endCursor?: Cursor;
}

export type InfiniteQueryResult<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> =
  | {
      error: Error;
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
  const [latestResp, setLatestResp] =
    useState<InfiniteQueryCallbackResponse<Schema, Q, UseDates>>();
  const [isLoading, setIsLoading] = useState(true);
  const subRef = useRef<InfiniteQuerySubscription | null>(null);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    // Ensure all data gets reset if the query/opts changes
    setIsLoading(true);
    setLatestResp(undefined);

    try {
      const sub = core.subscribeInfiniteQuery(
        query,
        (resp) => {
          if (resp.error) {
            setError(resp.error);
            setIsLoading(false);
          } else {
            setLatestResp(resp);
            setIsLoading(false);
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
      setError(e);
    }
  }, [weakHash(query), weakHash(opts)]);

  const loadMore = () => {
    subRef.current?.loadMore();
  };

  // @ts-expect-error discrimiated union return type
  return {
    data: error ? undefined : latestResp?.data,
    error: error,
    canLoadMore: latestResp?.canLoadMore ?? false,
    isLoading,
    loadMore,
  };
}
