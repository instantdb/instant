import {
  Cursor,
  InstaQLQueryEntityResult,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  type ValidInfiniteQueryObject,
  type InfiniteQuerySubscription,
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
  Entity extends keyof Schema['entities'],
  Q extends ValidInfiniteQueryObject<Q, Schema, Entity>,
  UseDates extends boolean,
> = {
  data: InstaQLQueryEntityResult<
    Schema['entities'],
    Entity,
    Q,
    true,
    UseDates
  >[];
  chunks: Chunk[];
  isLoading: boolean;
  loadMore: () => void;
  canLoadMore: boolean;
};

export function useInfiniteQuerySubscription<
  Schema extends InstantSchemaDef<any, any, any>,
  Entity extends keyof Schema['entities'],
  Q extends ValidInfiniteQueryObject<Q, Schema, Entity>,
  UseDates extends boolean,
>({
  core,
  entity,
  query,
  opts,
}: {
  core: InstantCoreDatabase<Schema, UseDates>;
  entity: Entity;
  query: Q;
  opts?: InstaQLOptions;
}): InfiniteQueryResult<Schema, Entity, Q, UseDates> {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<
    InstaQLQueryEntityResult<Schema['entities'], Entity, Q, true, UseDates>[]
  >([]);
  const subRef = useRef<InfiniteQuerySubscription | null>(null);

  useEffect(() => {
    const sub = core.subscribeInfiniteQuery(
      { [entity]: query } as any,
      (resp) => {
        setData((resp.data?.[entity] ?? []) as any);
        setChunks(resp.chunks as Chunk[]);
        setCanLoadMore(resp.canLoadMore);
        setIsLoading(false);
      },
      opts,
    );

    subRef.current = sub;

    return () => {
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, []);

  const loadMore = () => {
    subRef.current?.loadMore();
  };

  return useMemo(
    () => ({
      canLoadMore,
      chunks,
      data,
      isLoading,
      loadMore,
    }),
    [canLoadMore, chunks, data, isLoading],
  );
}
