import type { InstantCoreDatabase } from './index.ts';
import {
  InstaQLResponse,
  InstaQLOptions,
  Cursor,
  Order,
} from './queryTypes.ts';
import { InstantSchemaDef } from './schemaTypes.ts';

export type ChunkStatus = 'pre-bootstrap' | 'bootstrapping' | 'frozen';
interface Chunk {
  status: ChunkStatus;
  data: any[];
  hasMore?: boolean;
  endCursor?: Cursor;
}

export interface InfiniteQuerySubscription {
  unsubscribe: () => void;
  loadMore: () => void;
}

export type InfiniteQueryCallbackResponse<
  Schema extends InstantSchemaDef<any, any, any>,
  Query extends Record<string, any>,
  UseDatesLocal extends boolean,
> = {
  data?: InstaQLResponse<Schema, Query, UseDatesLocal>;
  canLoadMore: boolean;
  loadMore: () => void;
};

export const subscribeInfiniteQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  Entity extends keyof Schema['entities'],
  Q extends Record<string, any>,
  UseDatesLocal extends boolean,
>(
  db: InstantCoreDatabase<Schema, UseDatesLocal>,
  entityName: Entity,
  query: Q,
  cb: (
    resp: InfiniteQueryCallbackResponse<
      Schema,
      { [K in Entity]: Q },
      UseDatesLocal
    >,
  ) => void,
  opts?: InstaQLOptions,
): InfiniteQuerySubscription => {
  const pageSize = query.$?.limit || 10;
  const entity = entityName;

  const forwardChunks = new Map<string, Chunk>();
  const reverseChunks = new Map<string, Chunk>();
  const subs = new Map<string, () => void>();

  let hasKickstarted = false;
  let isActive = true;
  let lastReverseAdvancedChunkKey: string | null = null;
  let starterSub: (() => void) | null = null;

  const chunkSubKey = (direction: 'forward' | 'reverse', cursor: Cursor) =>
    `${direction}:${JSON.stringify(cursor)}`;

  const reverseOrder = (
    order?: Order<Schema, Entity>,
  ): Order<Schema, Entity> => {
    if (!order) {
      return {
        serverCreatedAt: 'asc',
      } satisfies Order<Schema, Entity>;
    }
    const key = Object.keys(order).at(0);
    if (!key) {
      return {
        serverCreatedAt: 'asc',
      } satisfies Order<Schema, Entity>;
    }
    return {
      [key]: order[key as keyof typeof order] === 'asc' ? 'desc' : 'asc',
    } as Order<Schema, Entity>;
  };

  const isDescendingOrder = (order?: Order<Schema, Entity>): boolean => {
    if (!order) return false;
    const key = Object.keys(order).at(0);
    if (!key) return false;
    return order[key as keyof typeof order] === 'desc';
  };

  const inclusiveBeforeCursor = (
    cursor: Cursor,
    order?: Order<Schema, Entity>,
  ): Cursor => {
    return isDescendingOrder(order)
      ? decrementCursor(cursor)
      : incrementCursor(cursor);
  };

  const readCanLoadMore = () => {
    const chunksInOrder = Array.from(forwardChunks.values());
    if (chunksInOrder.length === 0) return false;
    return chunksInOrder[chunksInOrder.length - 1]?.hasMore || false;
  };

  const pushUpdate = () => {
    if (!isActive) return;

    const chunks = [
      ...Array.from(reverseChunks.values()).slice().reverse(),
      ...Array.from(forwardChunks.values()),
    ];

    const data = [
      ...Array.from(reverseChunks.values())
        .slice()
        .reverse()
        .flatMap((chunk) => chunk.data.slice().reverse()),
      ...Array.from(forwardChunks.values()).flatMap((chunk) => chunk.data),
    ];

    cb({
      data: { [entity]: data } as InstaQLResponse<
        Schema,
        { [K in Entity]: Q },
        UseDatesLocal
      >,
      // @ts-expect-error chunks hidden from type
      chunks,
      canLoadMore: readCanLoadMore(),
      loadMore,
    });
  };

  const setForwardChunk = (startCursor: Cursor, chunk: Chunk) => {
    forwardChunks.set(JSON.stringify(startCursor), chunk);
    pushUpdate();
  };

  const setReverseChunk = (startCursor: Cursor, chunk: Chunk) => {
    reverseChunks.set(JSON.stringify(startCursor), chunk);
    maybeAdvanceReverse();
    pushUpdate();
  };

  const freezeReverse = (startCursor: Cursor) => {
    const key = JSON.stringify(startCursor);
    const currentSub = subs.get(chunkSubKey('reverse', startCursor));
    currentSub?.();

    const chunk = reverseChunks.get(key);
    if (!chunk?.endCursor) return;

    const nextSub = db.subscribeQuery(
      //@ts-expect-error dynamically built query can't be ValidQuery
      {
        [entity]: {
          ...query,
          $: {
            after: startCursor,
            before: inclusiveBeforeCursor(
              chunk.endCursor,
              reverseOrder(query.$?.order),
            ),
            where: query.$?.where,
            fields: query.$?.fields,
            order: reverseOrder(query.$?.order),
          },
        },
      },
      (frozenData) => {
        if (!frozenData?.data || !frozenData.pageInfo) return;

        const rows = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!rows || !pageInfo) return;

        setReverseChunk(startCursor, {
          data: rows,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    subs.set(chunkSubKey('reverse', startCursor), nextSub);
  };

  const pushNewReverse = (startCursor: Cursor) => {
    const querySub = db.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: pageSize,
            after: startCursor,
            where: query.$?.where,
            fields: query.$?.fields,
            order: reverseOrder(query.$?.order),
          },
        },
      } as any,
      (windowData) => {
        if (!windowData?.data || !windowData.pageInfo) return;

        const rows = windowData.data[entity];
        const pageInfo = windowData.pageInfo[entity];
        if (!rows || !pageInfo) return;

        setReverseChunk(startCursor, {
          data: rows,
          status: 'bootstrapping',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    subs.set(chunkSubKey('reverse', startCursor), querySub);
  };

  const pushNewForward = (startCursor: Cursor) => {
    const querySub = db.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: pageSize,
            after: startCursor,
            where: query.$?.where,
            fields: query.$?.fields,
            order: query.$?.order,
          },
        },
      } as any,
      (windowData) => {
        if (!windowData?.data || !windowData.pageInfo) return;

        const rows = windowData.data[entity];
        const pageInfo = windowData.pageInfo[entity];
        if (!rows || !pageInfo) return;

        setForwardChunk(startCursor, {
          data: rows,
          status: 'bootstrapping',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    subs.set(chunkSubKey('forward', startCursor), querySub);
  };

  const freezeForward = (startCursor: Cursor) => {
    const key = JSON.stringify(startCursor);
    const currentSub = subs.get(chunkSubKey('forward', startCursor));
    currentSub?.();

    const chunk = forwardChunks.get(key);
    if (!chunk?.endCursor) return;

    const nextSub = db.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            after: startCursor,
            before: inclusiveBeforeCursor(chunk.endCursor, query.$?.order),
            where: query.$?.where,
            fields: query.$?.fields,
            order: query.$?.order,
          },
        },
      } as any,
      (frozenData) => {
        if (!frozenData?.data || !frozenData.pageInfo) return;

        const rows = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!rows || !pageInfo) return;

        setForwardChunk(startCursor, {
          data: rows,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    subs.set(chunkSubKey('forward', startCursor), nextSub);
  };

  const maybeAdvanceReverse = () => {
    const tailEntry = Array.from(reverseChunks.entries()).at(-1);
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;
    if (!chunk?.hasMore || !chunk.endCursor) return;

    const advanceKey = `${chunkKey}:${JSON.stringify(chunk.endCursor)}`;
    if (advanceKey === lastReverseAdvancedChunkKey) return;

    lastReverseAdvancedChunkKey = advanceKey;
    freezeReverse(JSON.parse(chunkKey));
    pushNewReverse(chunk.endCursor);
  };

  const loadMore = () => {
    const tailEntry = Array.from(forwardChunks.entries()).at(-1);
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;
    if (!chunk?.endCursor) return;

    freezeForward(JSON.parse(chunkKey));
    pushNewForward(chunk.endCursor);
  };

  starterSub = db.subscribeQuery(
    {
      [entity]: {
        ...query,
        $: {
          limit: pageSize,
          where: query.$?.where,
          fields: query.$?.fields,
          order: query.$?.order,
        },
      },
    } as any,
    async (starterData) => {
      if (!starterData?.pageInfo) return;
      const pageInfo = starterData.pageInfo[entity];
      if (!pageInfo?.startCursor || hasKickstarted) return;

      const initialForwardCursor = isDescendingOrder(query.$?.order)
        ? incrementCursor(pageInfo.startCursor)
        : decrementCursor(pageInfo.startCursor);

      if (starterData.data?.[entity].length < pageSize) {
        // Do a fake save on what's *going* to be saved
        forwardChunks.clear();
        setForwardChunk(initialForwardCursor, {
          data: starterData.data[entity],
          status: 'pre-bootstrap',
        });
        return;
      }

      pushNewForward(initialForwardCursor as Cursor);
      pushNewReverse(pageInfo.startCursor);
      hasKickstarted = true;

      // Flush the initial boostrap querysub data
      // because immediately unsubscribing will never save it for offline in idb
      await db._reactor.querySubs.flush();

      starterSub?.();
      starterSub = null;
    },
    opts,
  );

  const unsubscribe = () => {
    if (!isActive) return;
    isActive = false;
    starterSub?.();
    starterSub = null;
    for (const sub of subs.values()) {
      sub?.();
    }
    subs.clear();
  };

  return {
    unsubscribe,
    loadMore,
  };
};

function decrementCursor(cursor: Cursor): Cursor {
  return [decrementUUID(cursor[0]), cursor[1], cursor[2], cursor[3]];
}

function incrementCursor(cursor: Cursor): Cursor {
  return [incrementUUID(cursor[0]), cursor[1], cursor[2], cursor[3]];
}

function decrementUUID(uuid: string): string {
  const hex = uuid
    .replace(/-/g, '')
    .split('')
    .map((c) => parseInt(c, 16));

  for (let i = hex.length - 1; i >= 0; i--) {
    if (hex[i] > 0) {
      hex[i]--;
      break;
    }
    hex[i] = 15;
  }

  const flat = hex.map((n) => n.toString(16)).join('');
  return `${flat.slice(0, 8)}-${flat.slice(8, 12)}-${flat.slice(12, 16)}-${flat.slice(16, 20)}-${flat.slice(20)}`;
}

function incrementUUID(uuid: string): string {
  const hex = uuid
    .replace(/-/g, '')
    .split('')
    .map((c) => parseInt(c, 16));

  for (let i = hex.length - 1; i >= 0; i--) {
    if (hex[i] < 15) {
      hex[i]++;
      break;
    }
    hex[i] = 0;
  }

  const flat = hex.map((n) => n.toString(16)).join('');
  return `${flat.slice(0, 8)}-${flat.slice(8, 12)}-${flat.slice(12, 16)}-${flat.slice(16, 20)}-${flat.slice(20)}`;
}
