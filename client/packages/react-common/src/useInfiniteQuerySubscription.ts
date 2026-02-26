import {
  type Cursor,
  type InstantCoreDatabase,
  type InstantSchemaDef,
  type InstaQLOptions,
  type ValidInfiniteQueryObject,
} from '@instantdb/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decrementCursor, incrementCursor } from './uuidMath.ts';

export type ChunkStatus = 'bootstrapping' | 'stable' | 'error';
export type ChunkQueryKind = 'head-live' | 'frozen' | 'tail-live';

export interface Chunk {
  id: string;
  afterCursor: Cursor | null;
  startCursor: Cursor | null;
  endCursor: Cursor | null;
  status: ChunkStatus;
  queryKind: ChunkQueryKind;
  data: any[];
  hasNextPage: boolean;
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

const headChunkId = '__head-live__';
const tailChunkId = '__tail-live__';

const createInitialState = (): InfiniteScrollState => ({ chunks: [] });
const chunkKey = (cursor: Cursor | null) => JSON.stringify(cursor ?? null);
const frozenChunkId = (startCursor: Cursor) =>
  `frozen:${chunkKey(startCursor)}`;

const getItemId = (item: any): string | null => {
  if (!item || typeof item !== 'object') return null;
  return typeof item.id === 'string' ? item.id : null;
};

const dedupeItemsById = (items: any[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = getItemId(item);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const upsertChunkInList = (chunks: Chunk[], incoming: Chunk) => {
  const index = chunks.findIndex((chunk) => chunk.id === incoming.id);
  if (index === -1) {
    return [...chunks, incoming];
  }

  const next = [...chunks];
  next[index] = { ...next[index], ...incoming };
  return next;
};

const headChunk = (chunks: Chunk[]) =>
  chunks.find((chunk) => chunk.queryKind === 'head-live');
const tailChunk = (chunks: Chunk[]) =>
  chunks.find((chunk) => chunk.queryKind === 'tail-live');
const frozenChunks = (chunks: Chunk[]) =>
  chunks.filter((chunk) => chunk.queryKind === 'frozen');

const buildHeadQuery = <Entity extends string, Q>(
  entity: Entity,
  query: Q,
) => ({
  [entity]: {
    ...query,
    $: {
      // @ts-expect-error query is constrained by caller
      first: query.$.pageSize,
      after: null,
      // @ts-expect-error query is constrained by caller
      where: query.$.where,
      // @ts-expect-error query is constrained by caller
      fields: query.$.fields,
      // @ts-expect-error query is constrained by caller
      order: query.$.order,
    },
  },
});

const buildTailQuery = <Entity extends string, Q>(
  entity: Entity,
  query: Q,
  after: Cursor,
) => ({
  [entity]: {
    ...query,
    $: {
      // @ts-expect-error query is constrained by caller
      first: query.$.pageSize,
      after,
      // @ts-expect-error query is constrained by caller
      where: query.$.where,
      // @ts-expect-error query is constrained by caller
      fields: query.$.fields,
      // @ts-expect-error query is constrained by caller
      order: query.$.order,
    },
  },
});

const buildFrozenQuery = <Entity extends string, Q>(
  entity: Entity,
  query: Q,
  start: Cursor,
  end: Cursor,
) => ({
  [entity]: {
    ...query,
    $: {
      after: decrementCursor(start),
      before: incrementCursor(end),
      // @ts-expect-error query is constrained by caller
      where: query.$.where,
      // @ts-expect-error query is constrained by caller
      fields: query.$.fields,
      // @ts-expect-error query is constrained by caller
      order: query.$.order,
    },
  },
});

export const isCursorWindowAligned = (
  data: any[],
  startCursor: Cursor | null,
  endCursor: Cursor | null,
  pageSize: number,
) => {
  if (!startCursor || !endCursor) return false;
  if (data.length < pageSize) return false;

  const firstRow = data[0];
  const boundaryRow = data[Math.min(pageSize, data.length) - 1];
  if (!firstRow || !boundaryRow) return false;

  return firstRow.id === startCursor[0] && boundaryRow.id === endCursor[0];
};

export const deriveMergedInfiniteData = (state: InfiniteScrollState) => {
  const head = headChunk(state.chunks);
  const frozen = frozenChunks(state.chunks);

  return dedupeItemsById([
    ...(head ? head.data : []),
    ...frozen.flatMap((chunk) => chunk.data),
  ]);
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
  const [state, setState] = useState<InfiniteScrollState>(createInitialState);
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const tailSubscriptionKeyRef = useRef<string | null>(null);
  const serializedQuery = JSON.stringify(query);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [serializedQuery]);

  const clearSubscriptionAtKey = useCallback((key: string) => {
    const unsubscribe = subscriptionsRef.current.get(key);
    if (!unsubscribe) return;
    unsubscribe();
    subscriptionsRef.current.delete(key);
  }, []);

  const clearAllSubscriptions = useCallback(() => {
    for (const unsubscribe of subscriptionsRef.current.values()) {
      unsubscribe?.();
    }
    subscriptionsRef.current = new Map();
    tailSubscriptionKeyRef.current = null;
  }, []);

  const upsertChunk = useCallback((chunk: Chunk) => {
    setState((prev) => ({ chunks: upsertChunkInList(prev.chunks, chunk) }));
  }, []);

  const setupFrozen = useCallback(
    (start: Cursor, end: Cursor, initialData: any[], hasNextPage: boolean) => {
      const id = frozenChunkId(start);
      if (subscriptionsRef.current.has(id)) return;

      upsertChunk({
        id,
        afterCursor: start,
        startCursor: start,
        endCursor: end,
        status: 'bootstrapping',
        queryKind: 'frozen',
        data: initialData,
        hasNextPage,
      });

      const frozenQuery = buildFrozenQuery(
        entity as string,
        queryRef.current,
        start,
        end,
      );
      const frozenUnsub = core.subscribeQuery(
        // @ts-expect-error entity key'd query
        frozenQuery,
        (resp) => {
          if (resp.error || !resp.data) {
            upsertChunk({
              id,
              afterCursor: start,
              startCursor: start,
              endCursor: end,
              status: 'error',
              queryKind: 'frozen',
              data: initialData,
              hasNextPage,
            });
            return;
          }

          upsertChunk({
            id,
            afterCursor: start,
            startCursor: resp.pageInfo?.[entity]?.startCursor ?? start,
            endCursor: resp.pageInfo?.[entity]?.endCursor ?? end,
            status: 'stable',
            queryKind: 'frozen',
            data: resp.data[entity],
            hasNextPage: resp.pageInfo?.[entity].hasNextPage ?? hasNextPage,
          });
        },
        opts,
      );

      subscriptionsRef.current.set(id, frozenUnsub);
    },
    [core, entity, opts, upsertChunk],
  );

  const setupTail = useCallback(
    (after: Cursor | null) => {
      if (!after) return;

      const subKey = `tail-live:${chunkKey(after)}`;
      if (tailSubscriptionKeyRef.current === subKey) return;

      if (tailSubscriptionKeyRef.current) {
        clearSubscriptionAtKey(tailSubscriptionKeyRef.current);
      }
      tailSubscriptionKeyRef.current = subKey;

      upsertChunk({
        id: tailChunkId,
        afterCursor: after,
        startCursor: null,
        endCursor: null,
        status: 'bootstrapping',
        queryKind: 'tail-live',
        data: [],
        hasNextPage: false,
      });

      const nextTailQuery = buildTailQuery(
        entity as string,
        queryRef.current,
        after,
      );
      const tailUnsub = core.subscribeQuery(
        // @ts-expect-error entity key'd query
        nextTailQuery,
        (resp) => {
          if (resp.error || !resp.data) {
            upsertChunk({
              id: tailChunkId,
              afterCursor: after,
              startCursor: null,
              endCursor: null,
              status: 'error',
              queryKind: 'tail-live',
              data: [],
              hasNextPage: false,
            });
            return;
          }

          upsertChunk({
            id: tailChunkId,
            afterCursor: after,
            startCursor: resp.pageInfo?.[entity]?.startCursor ?? null,
            endCursor: resp.pageInfo?.[entity]?.endCursor ?? null,
            status: 'stable',
            queryKind: 'tail-live',
            data: resp.data[entity],
            hasNextPage: resp.pageInfo?.[entity].hasNextPage ?? false,
          });
        },
        opts,
      );

      subscriptionsRef.current.set(subKey, tailUnsub);
    },
    [clearSubscriptionAtKey, core, entity, opts, upsertChunk],
  );

  const setupHead = useCallback(() => {
    if (subscriptionsRef.current.has(headChunkId)) return;

    upsertChunk({
      id: headChunkId,
      afterCursor: null,
      startCursor: null,
      endCursor: null,
      status: 'bootstrapping',
      queryKind: 'head-live',
      data: [],
      hasNextPage: false,
    });

    const nextHeadQuery = buildHeadQuery(entity as string, queryRef.current);
    const headUnsub = core.subscribeQuery(
      // @ts-expect-error entity key'd query
      nextHeadQuery,
      (resp) => {
        if (resp.error || !resp.data) {
          clearSubscriptionAtKey(headChunkId);
          upsertChunk({
            id: headChunkId,
            afterCursor: null,
            startCursor: null,
            endCursor: null,
            status: 'error',
            queryKind: 'head-live',
            data: [],
            hasNextPage: false,
          });
          return;
        }

        const data = resp.data[entity];
        const start = resp.pageInfo?.[entity]?.startCursor ?? null;
        const end = resp.pageInfo?.[entity]?.endCursor ?? null;
        const hasNextPage = resp.pageInfo?.[entity].hasNextPage ?? false;

        upsertChunk({
          id: headChunkId,
          afterCursor: null,
          startCursor: start,
          endCursor: end,
          status: 'stable',
          queryKind: 'head-live',
          data,
          hasNextPage,
        });

        const pageSize = queryRef.current.$.pageSize;
        if (!isCursorWindowAligned(data, start, end, pageSize)) return;
        setupFrozen(start, end, data, hasNextPage);
        setupTail(end);
      },
      opts,
    );

    subscriptionsRef.current.set(headChunkId, headUnsub);
  }, [
    clearSubscriptionAtKey,
    core,
    entity,
    opts,
    setupFrozen,
    setupTail,
    upsertChunk,
  ]);

  useEffect(() => {
    setState(createInitialState());
    clearAllSubscriptions();
    setupHead();

    return () => {
      clearAllSubscriptions();
    };
  }, [clearAllSubscriptions, entity, serializedQuery, setupHead]);

  const head = headChunk(state.chunks);
  const tail = tailChunk(state.chunks);
  const frozen = frozenChunks(state.chunks);

  const isLoading =
    state.chunks.length === 0 || head?.status === 'bootstrapping';
  const isLoadingMore = frozen.length > 0 && tail?.status === 'bootstrapping';
  const canLoadMore =
    tail?.status === 'stable' &&
    !!tail.startCursor &&
    !!tail.endCursor &&
    tail.data.length > 0;

  const loadMore = async () => {
    if (
      !tail ||
      tail.status !== 'stable' ||
      !tail.startCursor ||
      !tail.endCursor
    ) {
      return;
    }

    setupFrozen(tail.startCursor, tail.endCursor, tail.data, tail.hasNextPage);
    setupTail(tail.endCursor);
  };

  return {
    data: deriveMergedInfiniteData(state),
    isLoading,
    isLoadingMore,
    chunks: state.chunks,
    loadMore,
    canLoadMore,
  };
}
