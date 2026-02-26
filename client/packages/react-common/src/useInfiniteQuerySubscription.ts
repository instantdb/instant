import {
  Cursor,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  type ValidInfiniteQueryObject,
} from '@instantdb/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decrementCursor, incrementCursor } from './uuidMath.ts';

export type ChunkStatus = 'bootstrapping' | 'frozen';

export interface Chunk {
  id: number;
  status: ChunkStatus;
  data: any[];
  hasMore?: boolean;
}

export interface InfiniteScrollState {
  chunks: Chunk[];
}

export type InfiniteQueryResult<
  Schema extends InstantSchemaDef<any, any, any>,
  Entity extends keyof Schema['entities'],
  Q extends ValidInfiniteQueryObject<Q, Schema, Entity>,
  UseDates extends boolean,
> = {
  data: any[];
  chunks: Chunk[];
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
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
  const sortDirection = query.$.order
    ? Object.entries(query.$.order).at(0)?.[1] || 'asc'
    : 'asc';

  const getStartCursor = async () => {
    const response = await core.queryOnce({
      [entity]: {
        ...query,
        $: {
          limit: query.$.pageSize,
          where: query.$.where,
          fields: query.$.fields,
          order: query.$.order,
        },
      },
    } as any);
    return response.pageInfo[entity].startCursor;
  };

  const [forwardChunks, setForwardChunks] = useState<Chunk[]>([]);

  const pushNewForward = (startCursor: Cursor) => {
    const querySub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: query.$.pageSize,
            after: startCursor, // if reverse then we do before????? or swap order idk
            // common fields
            where: query.$.where,
            fields: query.$.fields,
            order: query.$.order,
          },
        },
      } as any,
      (data) => {},
    );
  };

  useEffect(() => {
    const setup = async () => {
      const startCursor = await getStartCursor();
      pushNewForward(startCursor);
    };

    setup();
  }, []);

  const canLoadMore = useMemo(() => {
    if (forwardChunks.length === 0) return false;
    const lastChunk = forwardChunks[forwardChunks.length - 1];
    return lastChunk.hasMore || false;
  }, [forwardChunks]);

  return {
    canLoadMore: canLoadMore,
    chunks: [],
    data: [],
    isLoading: false,
    isLoadingMore: false,
    loadMore: async () => {},
  };
}

const useKeyCount = () => {
  const [count, setCount] = useState(0);

  return () => {
    const currentCount = count;
    setCount((prev) => prev + 1);
    return currentCount;
  };
};
