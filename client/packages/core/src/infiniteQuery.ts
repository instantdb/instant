import {
  coerceQuery,
  QueryValidationError,
  type InstantCoreDatabase,
  type ValidQuery,
} from './index.ts';
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
  afterInclusive?: boolean;
}

export interface InfiniteQuerySubscription {
  unsubscribe: () => void;
  loadNextPage: () => void;
}

const readCanLoadNextPage = (forwardChunks: Map<string, Chunk>) => {
  const chunksInOrder = Array.from(forwardChunks.values());
  if (chunksInOrder.length === 0) return false;
  return chunksInOrder[chunksInOrder.length - 1]?.hasMore || false;
};

const chunkSubKey = (direction: 'forward' | 'reverse', cursor: Cursor) =>
  `${direction}:${JSON.stringify(cursor)}`;

const reverseOrder = <
  Schema extends InstantSchemaDef<any, any, any>,
  Entity extends keyof Schema['entities'],
>(
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

const normalizeChunks = (
  forwardChunks: Map<string, Chunk>,
  reverseChunks: Map<string, Chunk>,
): { chunks: Chunk[]; data: any[] } => {
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
  return { chunks, data };
};

const PRE_BOOTSTRAP_CURSOR: Cursor = ['bootstrap', 'bootstrap', 'bootstrap', 1];

export type InfiniteQueryCallbackResponse<
  Schema extends InstantSchemaDef<any, any, any>,
  Query extends Record<string, any>,
  UseDatesLocal extends boolean,
> =
  | {
      error: { message: string };
      data: undefined;
      canLoadNextPage: boolean;
    }
  | {
      error: undefined;
      data: InstaQLResponse<Schema, Query, UseDatesLocal>;
      canLoadNextPage: boolean;
    };

export const subscribeInfiniteQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
>(
  db: InstantCoreDatabase<Schema, UseDates>,
  fullQuery: Q,
  cb: (resp: InfiniteQueryCallbackResponse<Schema, Q, UseDates>) => void,
  opts?: InstaQLOptions,
): InfiniteQuerySubscription => {
  const entityNames = Object.keys(fullQuery);
  if (entityNames.length !== 1) {
    throw new QueryValidationError(
      'subscribeInfiniteQuery expects exactly one entity',
    );
  }

  const [entityName, query] = Object.entries(fullQuery)[0];

  if (!entityName || !query) {
    throw new QueryValidationError('No query provided for infinite query');
  }

  const pageSize = query.$?.limit || 10;
  const entity = entityName;

  const forwardChunks = new Map<string, Chunk>();
  const reverseChunks = new Map<string, Chunk>();
  const subs = new Map<string, () => void>();

  let hasKickstarted = false;
  let isActive = true;
  let lastReverseAdvancedChunkKey: string | null = null;
  let starterSub: (() => void) | null = null;

  const sendError = (err: { message: string }) => {
    cb({ error: err, data: undefined, canLoadNextPage: false });
  };

  const pushUpdate = () => {
    if (!isActive) return;

    const { chunks, data } = normalizeChunks(forwardChunks, reverseChunks);
    cb({
      //@ts-expect-error can't infer entity
      data: { [entity]: data } as InstaQLResponse<
        Schema,
        typeof query,
        UseDates
      >,
      chunks,
      canLoadNextPage: readCanLoadNextPage(forwardChunks),
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
            before: chunk.endCursor,
            beforeInclusive: true,
            where: query.$?.where,
            fields: query.$?.fields,
            order: reverseOrder(query.$?.order),
          },
        },
      },
      (frozenData) => {
        if (frozenData.error?.message) {
          return sendError({ message: frozenData.error.message });
        }
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
        if (windowData.error?.message) {
          return sendError({ message: windowData.error.message });
        }
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

  const pushNewForward = (startCursor: Cursor, afterInclusive = false) => {
    const querySub = db.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            limit: pageSize,
            after: startCursor,
            afterInclusive,
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
          afterInclusive,
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
            afterInclusive: chunk.afterInclusive,
            before: chunk.endCursor,
            beforeInclusive: true,
            where: query.$?.where,
            fields: query.$?.fields,
            order: query.$?.order,
          },
        },
      } as any,
      (frozenData) => {
        if (frozenData.error?.message) {
          return sendError({ message: frozenData.error.message });
        }
        if (!frozenData?.data || !frozenData.pageInfo) return;

        const rows = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        if (!rows || !pageInfo) return;

        setForwardChunk(startCursor, {
          data: rows,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
          afterInclusive: chunk.afterInclusive,
        });
      },
      opts,
    );

    subs.set(chunkSubKey('forward', startCursor), nextSub);
  };

  // Checks if the "leftmost" reverse chunk has more entries before it.
  // Then adds a new chunk to the end if so
  // This gets run on every update to the leftmost chunk
  const maybeAdvanceReverse = () => {
    const tailEntry = Array.from(reverseChunks.entries()).at(-1);
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;
    if (!chunk?.hasMore || !chunk.endCursor) return;

    // This prevents adding the same new reverse frame twice
    const advanceKey = `${chunkKey}:${JSON.stringify(chunk.endCursor)}`;
    if (advanceKey == lastReverseAdvancedChunkKey) return;

    lastReverseAdvancedChunkKey = advanceKey;
    freezeReverse(JSON.parse(chunkKey));
    pushNewReverse(chunk.endCursor);
  };

  const loadNextPage = () => {
    const tailEntry = Array.from(forwardChunks.entries()).at(-1);
    // This can happen at the very start when the starter query has not run the callback yet
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;
    // Only forward chunks that have an end cursor can start a one
    // so that you know where to start from
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
      if (hasKickstarted) return;
      if (starterData.error) {
        return sendError({ message: starterData.error.message });
      }
      if (!starterData?.pageInfo) {
        return sendError({ message: 'No pageInfo in starterData' });
      }
      const pageInfo = starterData.pageInfo[entity];

      const rows = starterData?.data?.[entity] || [];

      if (rows.length < pageSize) {
        // Do a fake save on what's *going* to be saved
        setForwardChunk(PRE_BOOTSTRAP_CURSOR, {
          data: rows,
          status: 'pre-bootstrap',
        });
        return;
      }

      if (!pageInfo.startCursor) {
        return sendError({
          message: 'No startCursor in pageInfo after boostrap',
        });
      }

      forwardChunks.delete(JSON.stringify(PRE_BOOTSTRAP_CURSOR));
      const initialForwardCursor = pageInfo.startCursor;

      // Seed the initial window immediately so reverse bootstrap updates
      // cannot publish a transient empty payload before forward resolves.
      setForwardChunk(initialForwardCursor, {
        data: rows,
        status: 'pre-bootstrap',
        hasMore: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
        afterInclusive: true,
      });

      pushNewForward(initialForwardCursor, true);
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
    loadNextPage,
  };
};

export const getInfiniteQueryInitialSnapshot = <
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
>(
  db: InstantCoreDatabase<Schema, UseDates>,
  fullQuery: Q,
  opts?: InstaQLOptions,
): InfiniteQueryCallbackResponse<Schema, Q, UseDates> => {
  const entityNames = Object.keys(fullQuery);
  if (entityNames.length !== 1) {
    throw new QueryValidationError(
      'subscribeInfiniteQuery expects exactly one entity',
    );
  }

  const [entityName, entityQuery] = Object.entries(fullQuery)[0];

  if (!entityName || !entityQuery) {
    throw new QueryValidationError('No query provided for infinite query');
  }

  const pageSize = entityQuery.$?.limit || 10;
  const entity = entityName;

  let coercedQuery = fullQuery
    ? coerceQuery({
        [entity]: {
          ...entityQuery,
          $: {
            limit: pageSize,
            where: entityQuery.$?.where,
            fields: entityQuery.$?.fields,
            order: entityQuery.$?.order,
          },
        },
      })
    : null;

  if (opts && 'ruleParams' in opts) {
    coercedQuery = {
      $$ruleParams: opts.ruleParams,
      ...fullQuery,
    };
  }
  const queryResult = db._reactor.getPreviousResult(coercedQuery);

  return {
    canLoadNextPage: false,
    data: queryResult?.data || undefined,
    error: undefined,
  };
};
