import {
  Cursor,
  InstaQLQueryEntityResult,
  Order,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  type ValidInfiniteQueryObject,
} from '@instantdb/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decrementCursor, incrementCursor } from './uuidMath.ts';

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
  const [forwardChunks, setForwardChunks] = useState<Map<string, Chunk>>(
    new Map(),
  );

  const [reverseChunks, setReverseChunks] = useState<Map<string, Chunk>>(
    new Map(),
  );

  const [isLoading, setIsLoading] = useState(false);

  const subs = useRef<Map<string, () => void>>(new Map());
  const hasKickstarted = useRef(false);

  const setForwardChunk = (startCursor: Cursor, Chunk: Chunk) => {
    setForwardChunks((prev) =>
      new Map(prev).set(JSON.stringify(startCursor), Chunk),
    );
  };

  const setReverseChunk = (startCursor: Cursor, Chunk: Chunk) => {
    setReverseChunks((prev) =>
      new Map(prev).set(JSON.stringify(startCursor), Chunk),
    );
  };

  const freezeReverse = (startCursor: Cursor) => {
    const querySub = subs.current.get(JSON.stringify(startCursor));
    querySub?.();

    const chunk = reverseChunks.get(JSON.stringify(startCursor));
    if (!chunk) throw new Error('No window for cursor');
    if (!chunk.endCursor) throw new Error('No end cursor to snap to');

    // TODO unsub
    const newSub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            after: startCursor,
            before: decrementCursor(chunk.endCursor),
            // common fields
            where: query.$.where,
            fields: query.$.fields,
            order: reverseOrder(query.$.order),
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData || !frozenData.data || !frozenData.pageInfo) return;
        const data = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!data || !pageInfo) return;

        setReverseChunk(startCursor, {
          data,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );
    subs.current.set(JSON.stringify(startCursor), newSub);
  };

  const pushNewReverse = (startCursor: Cursor) => {
    const querySub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: query.$.pageSize,
            after: startCursor,
            where: query.$.where,
            fields: query.$.fields,
            order: reverseOrder(query.$.order),
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData || !frozenData.data || !frozenData.pageInfo) return;
        const data = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!data || !pageInfo) return;

        setReverseChunk(startCursor, {
          data,
          status: 'bootstrapping',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );
    subs.current.set(JSON.stringify(startCursor), querySub);
  };

  const pushNewForward = (startCursor: Cursor) => {
    const querySub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: query.$.pageSize,
            after: startCursor,
            // common fields
            where: query.$.where,
            fields: query.$.fields,
            order: query.$.order,
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData || !frozenData.data || !frozenData.pageInfo) return;
        const data = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!data || !pageInfo) return;

        setForwardChunk(startCursor, {
          data,
          status: 'bootstrapping',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );
    subs.current.set(JSON.stringify(startCursor), querySub);
  };

  const freezeForward = (startCursor: Cursor) => {
    const querySub = subs.current.get(JSON.stringify(startCursor));
    querySub?.();

    const chunk = forwardChunks.get(JSON.stringify(startCursor));
    if (!chunk) throw new Error('No window for cursor');
    if (!chunk.endCursor) throw new Error('No end cursor to snap to');

    const newSub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            after: startCursor,
            before: incrementCursor(chunk.endCursor),
            // common fields
            where: query.$.where,
            fields: query.$.fields,
            order: query.$.order,
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData || !frozenData.data || !frozenData.pageInfo) return;
        const data = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!data || !pageInfo) return;

        setForwardChunk(startCursor, {
          data,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );
    subs.current.set(JSON.stringify(startCursor), newSub);
  };

  useEffect(() => {
    const sub = core.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: query.$.pageSize,
            where: query.$.where,
            fields: query.$.fields,
            order: query.$.order,
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData || !frozenData.pageInfo) return;
        const pageInfo = frozenData.pageInfo[entity];
        if (!pageInfo?.startCursor || hasKickstarted.current) return;

        pushNewForward(decrementCursor(pageInfo.startCursor) as any);
        pushNewReverse(pageInfo.startCursor);
        hasKickstarted.current = true;
      },
      opts,
    );

    return sub;
  }, []);

  useEffect(() => {
    return () => {
      for (const sub of subs.current.values()) {
        sub?.();
      }
      subs.current.clear();
    };
  }, []);

  const canLoadMore = useMemo(() => {
    const chunksInOrder = Array.from(forwardChunks.values());

    if (chunksInOrder.length === 0) return false;
    const lastChunk = chunksInOrder[chunksInOrder.length - 1];
    return lastChunk.hasMore || false;
  }, [forwardChunks]);

  const canLoadPrevious = useMemo(() => {
    const chunksInOrder = Array.from(reverseChunks.values()).toReversed();
    if (chunksInOrder.length === 0) return false;
    const lastChunk = chunksInOrder[0];
    return lastChunk.hasMore || false;
  }, [reverseChunks]);

  useEffect(() => {
    if (canLoadPrevious) {
      const chunksInOrder = Array.from(reverseChunks.entries());
      const [lastChunkId, lastChunk] = chunksInOrder.at(-1)!;
      if (!lastChunk.endCursor) return;
      freezeReverse(JSON.parse(lastChunkId));
      pushNewReverse(lastChunk.endCursor);
    }
  }, [canLoadPrevious]);

  const loadMore = () => {
    if (!canLoadMore) return;
    const entry = Array.from(forwardChunks.entries()).at(-1);
    if (!entry) return;
    const [lastChunkId, lastChunk] = entry;
    if (!lastChunk) return;
    if (!lastChunk.endCursor) return;
    freezeForward(JSON.parse(lastChunkId));
    pushNewForward(lastChunk.endCursor);
  };

  return {
    canLoadMore: canLoadMore,
    chunks: [
      ...Array.from(reverseChunks.values()).toReversed(),
      ...Array.from(forwardChunks.values()),
    ],
    data: [
      ...Array.from(reverseChunks.values())
        .toReversed()
        .flatMap((chunk) => chunk.data.toReversed()),
      ...Array.from(forwardChunks.values()).flatMap((chunk) => chunk.data),
    ],
    isLoading: false,
    loadMore: loadMore,
  };
}

const reverseOrder = (order?: Order<any, any>): Order<any, any> => {
  if (!order) {
    return {
      serverCreatedAt: 'asc',
    };
  }
  const key = Object.keys(order).at(0);
  if (!key)
    return {
      serverCreatedAt: 'asc',
    };
  return {
    [key]: order[key] === 'asc' ? 'desc' : 'asc',
  };
};
