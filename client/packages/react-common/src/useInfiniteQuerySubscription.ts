import {
  Cursor,
  InstaQLQueryEntityResult,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  type InfiniteQuerySubscription,
  ValidQuery,
  InfiniteQueryCallbackResponse,
  weakHash,
} from '@instantdb/core';
import { useEffect, useMemo, useRef, useState } from 'react';

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
> = InfiniteQueryCallbackResponse<Schema, Q, UseDates> & {
  isLoading: boolean;
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

  useEffect(() => {
    // Ensure all data gets reset if the query/opts changes
    setIsLoading(true);
    setLatestResp(undefined);

    const sub = core.subscribeInfiniteQuery(
      query,
      (resp) => {
        setLatestResp(resp);
        setIsLoading(false);
      },
      opts,
    );

    subRef.current = sub;

    return () => {
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, [weakHash(query), weakHash(opts)]);

  const loadMore = () => {
    subRef.current?.loadMore();
  };

  return {
    ...latestResp,
    canLoadMore: latestResp?.canLoadMore ?? false,
    isLoading,
    loadMore,
  };
}
