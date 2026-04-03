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
import { assert } from './utils/error.ts';

//   Example for {order: {value: "asc"}}
//
//                      0
//   <------------------|------------------------------------------------------>
//                     <- starter sub ->
//
//   Bootstrap phase: until the limit (4 in this example) items are reached, the
//   starter subscription is the only subscription and it writes to the forwardChunks map with the key PRE_BOOTSTRAP_CURSOR.
//
//   When the limit is reached it automatically becomes a real forward chunk and has a definite start and end.
//   A new reverse chunk gets added to watch for any new items at the start of the list.
//
//                      0    1    2    3
//   <------------------|------------------------------------------------------>
//                     <-  starter sub ->
//
//                      ↓ BECOMES ↓
//
//                      0    1    2    3
//   <------------------|------------------------------------------------------>
//      <-reverse chunk][forward chunk   ]
//
//                      0    1    2    3    4
//   <------------------|------------------------------------------------------>
//      <-reverse chunk][forward chunk ]
//   When item 4 is added, the forward chunk subscription gets updated so that
//   hasNextPage is `true`. This tells the user that a new page can be loaded.
//
//   User clicks: loadNextPage
//                      0          1      2    3    4
//   <------------------|------------------------------------------------------>
//      <-reverse chunk][ frozen forward chunk ][  new forward chunk  ]
//
//   More numbers get added
//                      0          1      2    3    4       5    6   7   8
//   <------------------|------------------------------------------------------>
//      <-reverse chunk][ frozen forward chunk ][      forward chunk   ] ^
//                                                       hasNextPage=true^
//
//
//   User clicks: loadNextPage
//
//                      0          1      2    3    4         5     6   7   8
//   <------------------|------------------------------------------------------>
//      <-reverse chunk][ frozen forward chunk ][ frozen forward chunk  ][ new chunk
//
//   The reverse chunks work in the same way as the forward chunks but the order in the query is reversed.
//   When a reverse chunks recieves an update it will check to see if more can be loaded and it will
//   automatically freeze the chunk and add a new one. i.e. : works the same as if
//   loadNextPage was automatically clicked when hasNextPage became true.
//
//   Chunks are indexed by their starting point cursor, for forward chunks this is the "[" point.
//   Their starting point cursor is inclusive in the query and exclusive from the following query

const makeCursorKey = (cursor: Cursor) => JSON.stringify(cursor);
const makeChunkKey = (cursor: Cursor, afterInclusive = false) =>
  JSON.stringify([cursor, afterInclusive]);
const parseChunkKey = (chunkKey: string) => {
  const [cursor, afterInclusive] = JSON.parse(chunkKey) as [Cursor, boolean];
  return { cursor, afterInclusive };
};

// Chunk sub key is used to create keys to keep track of the subscriptions
// while chunk maps are keyed by [cursor, afterInclusive], we still distinguish
// between forward and reverse to avoid clashes that can share the same key.
const chunkSubKey = (
  direction: 'forward' | 'reverse',
  cursor: Cursor,
  afterInclusive = false,
) => `${direction}:${makeChunkKey(cursor, afterInclusive)}`;

export type ChunkStatus = 'pre-bootstrap' | 'bootstrapping' | 'frozen';
type Chunk = {
  status: ChunkStatus;
  data: any[];
  hasMore?: boolean;
  endCursor?: Cursor;
  afterInclusive?: boolean;
};

type ChunkWithEndCursor = Chunk & { endCursor: Cursor };

const chunkHasEndCursor = (chunk: Chunk): chunk is ChunkWithEndCursor => {
  return !!chunk.endCursor;
};

export interface InfiniteQuerySubscription {
  unsubscribe: () => void;
  loadNextPage: () => void;
}

const readCanLoadNextPage = (forwardChunks: Map<string, Chunk>) => {
  const chunksInOrder = Array.from(forwardChunks.values());
  if (chunksInOrder.length === 0) return false;
  return chunksInOrder[chunksInOrder.length - 1]?.hasMore || false;
};

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

const resolveOrder = <
  Schema extends InstantSchemaDef<any, any, any>,
  Entity extends keyof Schema['entities'],
>(
  order?: Order<Schema, Entity>,
): Order<Schema, Entity> => {
  if (order && Object.keys(order).length > 0) return order;
  // serverCreatedAt: 'asc' is the implicit order in queries without an `order`
  // field. We need this to be explicit, because when doing `reverse` queries, we rely
  // on inverting this order.
  return {
    serverCreatedAt: 'asc',
  } satisfies Order<Schema, Entity>;
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
  const { entityName, entityQuery: query } = splitAndValidateQuery(fullQuery);

  const pageSize = query.$?.limit || 10;
  const entity = entityName;
  const order = resolveOrder(query.$?.order);

  const forwardChunks = new Map<string, Chunk>();
  const reverseChunks = new Map<string, Chunk>();
  // Keeps track of all subscriptions (besides starter sub)
  const allUnsubs = new Map<string, () => void>();

  let hasKickstarted = false;
  let isActive = true;
  let lastReverseAdvancedChunkKey: string | null = null;
  let starterUnsub: (() => void) | null = null;

  const sendError = (err: { message: string }) => {
    cb({ error: err, data: undefined, canLoadNextPage: false });
  };

  const pushUpdate = () => {
    if (!isActive) return;

    const { chunks, data } = normalizeChunks(forwardChunks, reverseChunks);
    cb({
      data: { [entity]: data } as InstaQLResponse<
        Schema,
        typeof query,
        UseDates
      >,
      // @ts-expect-error hidden debug variable
      chunks,
      canLoadNextPage: readCanLoadNextPage(forwardChunks),
    });
  };

  const setForwardChunk = (startCursor: Cursor, chunk: Chunk) => {
    forwardChunks.set(makeChunkKey(startCursor, chunk.afterInclusive), chunk);
    pushUpdate();
  };

  const setReverseChunk = (startCursor: Cursor, chunk: Chunk) => {
    reverseChunks.set(makeChunkKey(startCursor), chunk);
    maybeAdvanceReverse();
    pushUpdate();
  };

  const freezeReverse = (chunkKey: string, chunk: ChunkWithEndCursor) => {
    const { cursor: startCursor } = parseChunkKey(chunkKey);
    const currentSub = allUnsubs.get(chunkSubKey('reverse', startCursor));
    currentSub?.();

    const nextSub = db.subscribeQuery(
      {
        [entity]: {
          ...query,
          $: {
            after: startCursor,
            before: chunk.endCursor,
            beforeInclusive: true,
            where: query.$?.where,
            fields: query.$?.fields,
            order: reverseOrder(order),
          },
        },
      } as unknown as Q,
      (frozenData) => {
        if (frozenData.error) {
          return sendError(frozenData.error);
        }

        const rows = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        assert(
          rows && pageInfo,
          'Expected query subscription to contain rows and pageInfo',
        );

        setReverseChunk(startCursor, {
          data: rows,
          status: 'frozen',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    allUnsubs.set(chunkSubKey('reverse', startCursor), nextSub);
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
            order: reverseOrder(order),
          },
        },
      } as unknown as Q,
      (windowData) => {
        if (windowData.error) {
          return sendError(windowData.error);
        }

        const rows = windowData.data[entity];
        const pageInfo = windowData.pageInfo[entity];
        assert(rows && pageInfo, 'Expected rows and pageInfo');

        setReverseChunk(startCursor, {
          data: rows,
          status: 'bootstrapping',
          hasMore: pageInfo.hasNextPage,
          endCursor: pageInfo.endCursor,
        });
      },
      opts,
    );

    allUnsubs.set(chunkSubKey('reverse', startCursor), querySub);
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
            order,
          },
        },
      } as unknown as Q,
      (windowData) => {
        if (windowData.error) {
          return sendError(windowData.error);
        }

        const rows = windowData.data[entity];
        const pageInfo = windowData.pageInfo[entity];
        assert(rows && pageInfo, 'Page info and rows');

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

    allUnsubs.set(
      chunkSubKey('forward', startCursor, afterInclusive),
      querySub,
    );
  };

  const freezeForward = (startCursor: Cursor, afterInclusive = false) => {
    const key = makeChunkKey(startCursor, afterInclusive);
    const currentSub = allUnsubs.get(
      chunkSubKey('forward', startCursor, afterInclusive),
    );
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
            order,
          },
        },
      } as unknown as Q,
      (frozenData) => {
        if (frozenData.error) {
          return sendError(frozenData.error);
        }

        const rows = frozenData.data[entity];
        const pageInfo = frozenData.pageInfo[entity];
        assert(rows && pageInfo, 'Expected rows and pageInfo');

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

    allUnsubs.set(chunkSubKey('forward', startCursor, afterInclusive), nextSub);
  };

  // Consider order: {val: "asc"} with pageItems = 4
  // A reverse chunk captures all the new items coming in before us.
  // If we hit 4 then we freeze the current chunk and create a new reverse chunk
  const maybeAdvanceReverse = () => {
    const tailEntry = Array.from(reverseChunks.entries()).at(-1);
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;

    // If a chunk has more, then it must have an endCursor
    if (!chunk?.hasMore) return;
    if (!chunkHasEndCursor(chunk)) return;

    // maybeAdvanceReverse can run multiple times if multiple changes are made
    // to the reverse chunk
    // This prevents adding the same new reverse frame twice
    const advanceKey = `${chunkKey}:${makeCursorKey(chunk.endCursor)}`;
    if (advanceKey == lastReverseAdvancedChunkKey) return;
    lastReverseAdvancedChunkKey = advanceKey;

    freezeReverse(chunkKey, chunk);
    pushNewReverse(chunk.endCursor);
  };

  const loadNextPage = () => {
    const tailEntry = Array.from(forwardChunks.entries()).at(-1);
    if (!tailEntry) return;

    const [chunkKey, chunk] = tailEntry;

    // If the chunk has more items after it, it must have an end cursor, and we can
    // load more items
    // if (!chunk?.hasMore) return;
    if (!chunk.endCursor) return;

    const { cursor: startCursor, afterInclusive } = parseChunkKey(chunkKey);
    freezeForward(startCursor, afterInclusive);
    pushNewForward(chunk.endCursor);
  };

  starterUnsub = db.subscribeQuery(
    {
      [entity]: {
        ...query,
        $: {
          limit: pageSize,
          where: query.$?.where,
          fields: query.$?.fields,
          order,
        },
      },
    } as unknown as Q,
    async (starterData) => {
      if (hasKickstarted) return;
      if (starterData.error) {
        return sendError(starterData.error);
      }
      const pageInfo = starterData.pageInfo[entity];

      const rows = starterData?.data?.[entity];
      assert(rows && pageInfo, 'Expected rows and pageInfo');

      if (rows.length < pageSize) {
        // If the rows are less than the page size, then we don't need to
        // create forward and reverse chunks.
        // We just treat the starter query as a forward chunk
        setForwardChunk(PRE_BOOTSTRAP_CURSOR, {
          data: rows,
          status: 'pre-bootstrap',
        });
        return;
      }

      // Consider a query with no items; the server will return a result with
      // no start cursor. If we add {pageSize} optimistic updates we can
      // get here and still have no startCursor.
      // For now we treat the data we currently have like a pre boostrap
      // state.
      const initialForwardCursor = pageInfo.startCursor;
      if (!initialForwardCursor) {
        setForwardChunk(PRE_BOOTSTRAP_CURSOR, {
          data: rows,
          status: 'pre-bootstrap',
        });
        return;
      }

      forwardChunks.delete(makeChunkKey(PRE_BOOTSTRAP_CURSOR));

      pushNewForward(initialForwardCursor, true);
      pushNewReverse(pageInfo.startCursor);
      hasKickstarted = true;
    },
    opts,
  );

  const unsubscribe = () => {
    if (!isActive) return;
    isActive = false;
    starterUnsub?.();
    starterUnsub = null;
    for (const unsub of allUnsubs.values()) {
      unsub?.();
    }
    allUnsubs.clear();
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
  fullQuery: Q | null,
  opts?: InstaQLOptions,
):
  | InfiniteQueryCallbackResponse<Schema, Q, UseDates>
  | {
      canLoadNextPage: false;
      data: undefined;
      error: undefined;
    } => {
  if (!fullQuery) {
    return {
      canLoadNextPage: false,
      data: undefined,
      error: undefined,
    };
  }
  const { entityName, entityQuery } = splitAndValidateQuery(fullQuery);

  const pageSize = entityQuery.$?.limit || 10;
  const order = resolveOrder(entityQuery.$?.order);

  let coercedQuery = fullQuery
    ? coerceQuery({
        [entityName]: {
          ...entityQuery,
          $: {
            limit: pageSize,
            where: entityQuery.$?.where,
            fields: entityQuery.$?.fields,
            order,
          },
        },
      })
    : null;

  if (opts && 'ruleParams' in opts) {
    coercedQuery = {
      $$ruleParams: opts.ruleParams,
      ...coercedQuery,
    };
  }
  const queryResult = db._reactor.getPreviousResult(coercedQuery);

  return {
    canLoadNextPage: false,
    data: queryResult?.data || undefined,
    error: undefined,
  };
};

/**
 * @throws QueryValidationError
 * @param fullQuery a ValidQuery with one key (entity)
 */
const splitAndValidateQuery = (fullQuery: Record<string, any>) => {
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
  return { entityName, entityQuery };
};
