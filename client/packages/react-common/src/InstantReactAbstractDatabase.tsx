'use client';
import {
  // types
  Auth,
  Storage,
  txInit,
  type AuthState,
  type User,
  type ConnectionStatus,
  type TransactionChunk,
  type RoomSchemaShape,
  type InstaQLOptions,
  type InstantConfig,
  type PageInfoResponse,
  InstantCoreDatabase,
  init as core_init,
  InstaQLLifecycleState,
  InstaQLResponse,
  RoomsOf,
  InstantSchemaDef,
  IInstantDatabase,
  InstantError,
  ValidQuery,
  Streams,
  ValidInfiniteQueryObject,
  Cursor,
} from '@instantdb/core';
import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQueryInternal } from './useQuery.ts';
import { InstantReactRoom, rooms } from './InstantReactRoom.ts';
import { decrementCursor, incrementCursor } from './uuidMath.ts';

const defaultAuthState = {
  isLoading: true,
  user: undefined,
  error: undefined,
};

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

const createInitialInfiniteScrollState = (): InfiniteScrollState => ({
  chunks: [],
});

const headChunkId = '__head-live__';
const tailChunkId = '__tail-live__';

const getChunkId = (afterCursor: Cursor | null) =>
  JSON.stringify(afterCursor ?? null);

const getFrozenChunkId = (startCursor: Cursor) => `frozen:${getChunkId(startCursor)}`;

const getItemId = (item: any): string | null => {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.id !== 'string') return null;
  return item.id;
};

const dedupeItemsById = (items: any[]) => {
  const seenIds = new Set<string>();

  return items.filter((item) => {
    const itemId = getItemId(item);
    if (!itemId) return true;
    if (seenIds.has(itemId)) return false;
    seenIds.add(itemId);
    return true;
  });
};

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

const chunkOrder = (chunk: Chunk) => {
  if (chunk.queryKind === 'head-live') return 0;
  if (chunk.queryKind === 'frozen') return 1;
  return 2;
};

const orderChunks = (chunks: Chunk[]) => {
  return [...chunks].sort((a, b) => {
    const rankDiff = chunkOrder(a) - chunkOrder(b);
    if (rankDiff !== 0) return rankDiff;

    if (a.queryKind === 'frozen' && b.queryKind === 'frozen') {
      if (!a.startCursor) return -1;
      if (!b.startCursor) return 1;
      if (a.startCursor[0] === b.startCursor[0]) return 0;
      return a.startCursor[0] < b.startCursor[0] ? -1 : 1;
    }

    return a.id < b.id ? -1 : 1;
  });
};

export function deriveMergedInfiniteData(state: InfiniteScrollState): any[] {
  const headChunk = state.chunks.find((chunk) => chunk.queryKind === 'head-live');
  const frozenChunks = state.chunks.filter((chunk) => chunk.queryKind === 'frozen');

  const orderedSources = [
    ...(headChunk ? [headChunk.data] : []),
    ...orderChunks(frozenChunks).map((chunk) => chunk.data),
  ];

  return dedupeItemsById(orderedSources.flat());
}

type InfiniteQueryResult<
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

export default abstract class InstantReactAbstractDatabase<
  // need to pull this schema out to another generic for query params, not sure why
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<
    Schema,
    UseDates
  >,
  Rooms extends RoomSchemaShape = RoomsOf<Schema>,
> implements IInstantDatabase<Schema>
{
  public tx = txInit<Schema>();

  public auth: Auth;
  public storage: Storage;
  public streams: Streams;
  public core: InstantCoreDatabase<Schema, UseDates>;

  /** @deprecated use `core` instead */
  public _core: InstantCoreDatabase<Schema, UseDates>;

  static Store?: any;
  static NetworkListener?: any;
  static EventSourceImpl?: any;

  constructor(
    config: Omit<InstantConfig<Schema, UseDates>, 'useDateObjects'> & {
      useDateObjects?: UseDates;
    },
    versions?: { [key: string]: string },
  ) {
    this.core = core_init<Schema, UseDates>(
      config,
      // @ts-expect-error because TS can't resolve subclass statics
      config.Store || this.constructor.Store,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.NetworkListener,
      versions,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.EventSourceImpl,
    );
    this._core = this.core;
    this.auth = this.core.auth;
    this.storage = this.core.storage;
    this.streams = this.core.streams;
  }

  /**
   * Returns a unique ID for a given `name`. It's stored in local storage,
   * so you will get the same ID across sessions.
   *
   * This is useful for generating IDs that could identify a local device or user.
   *
   * @example
   *  const deviceId = await db.getLocalId('device');
   */
  getLocalId = (name: string): Promise<string> => {
    return this.core.getLocalId(name);
  };

  /**
   * A hook that returns a unique ID for a given `name`. localIds are
   * stored in local storage, so you will get the same ID across sessions.
   *
   * Initially returns `null`, and then loads the localId.
   *
   * @example
   * const deviceId = db.useLocalId('device');
   * if (!deviceId) return null; // loading
   * console.log('Device ID:', deviceId)
   */
  useLocalId = (name: string): string | null => {
    const [localId, setLocalId] = useState<string | null>(null);

    useEffect(() => {
      let mounted = true;
      const f = async () => {
        const id = await this.getLocalId(name);
        if (!mounted) return;
        setLocalId(id);
      };
      f();
      return;
    }, [name]);

    return localId;
  };

  /**
   * Obtain a handle to a room, which allows you to listen to topics and presence data
   *
   * If you don't provide a `type` or `id`, Instant will default to `_defaultRoomType` and `_defaultRoomId`
   * as the room type and id, respectively.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   *
   * @example
   *  const room = db.room('chat', roomId);
   *  const { peers } = db.rooms.usePresence(room);
   */
  room<RoomType extends string & keyof Rooms>(
    type: RoomType = '_defaultRoomType' as RoomType,
    id: string = '_defaultRoomId',
  ) {
    return new InstantReactRoom<Schema, Rooms, RoomType>(this.core, type, id);
  }

  /**
   * Hooks for working with rooms
   *
   * @see https://instantdb.com/docs/presence-and-topics
   *
   * @example
   *  const room = db.room('chat', roomId);
   *  const { peers } = db.rooms.usePresence(room);
   *  const publish = db.rooms.usePublishTopic(room, 'emoji');
   *  // ...
   */
  rooms = rooms;

  /**
   * Use this to write data! You can create, update, delete, and link objects
   *
   * @see https://instantdb.com/docs/instaml
   *
   * @example
   *   // Create a new object in the `goals` namespace
   *   const goalId = id();
   *   db.transact(db.tx.goals[goalId].update({title: "Get fit"}))
   *
   *   // Update the title
   *   db.transact(db.tx.goals[goalId].update({title: "Get super fit"}))
   *
   *   // Delete it
   *   db.transact(db.tx.goals[goalId].delete())
   *
   *   // Or create an association:
   *   todoId = id();
   *   db.transact([
   *    db.tx.todos[todoId].update({ title: 'Go on a run' }),
   *    db.tx.goals[goalId].link({todos: todoId}),
   *  ])
   */
  transact = (
    chunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => {
    return this.core.transact(chunks);
  };

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *   // listen to all goals
   *   const { isLoading, error, data } = db.useQuery({ goals: {} });
   *
   *   // goals where the title is "Get Fit"
   *   const { isLoading, error, data } = db.useQuery({
   *     goals: { $: { where: { title: 'Get Fit' } } },
   *   });
   *
   *   // all goals, _alongside_ their todos
   *   const { isLoading, error, data } = db.useQuery({
   *     goals: { todos: {} },
   *   });
   *
   *   // skip if `user` is not logged in
   *   const { isLoading, error, data } = db.useQuery(
   *     auth.user ? { goals: {} } : null,
   *   );
   */
  useQuery = <Q extends ValidQuery<Q, Schema>>(
    query: null | Q,
    opts?: InstaQLOptions,
  ): InstaQLLifecycleState<Schema, Q, UseDates> => {
    return useQueryInternal<Q, Schema, UseDates>(this.core, query, opts).state;
  };

  /**
   * Listen for the logged in state. This is useful
   * for deciding when to show a login screen.
   *
   * Check out the docs for an example `Login` component too!
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  function App() {
   *    const { isLoading, user, error } = db.useAuth()
   *    if (isLoading) {
   *      return <div>Loading...</div>
   *    }
   *    if (error) {
   *      return <div>Uh oh! {error.message}</div>
   *    }
   *    if (user) {
   *      return <Main user={user} />
   *    }
   *    return <Login />
   *  }
   *
   */
  useAuth = (): AuthState => {
    return this._useAuth();
  };

  protected _useAuth(): AuthState {
    // We use a ref to store the result of the query.
    // This is becuase `useSyncExternalStore` uses `Object.is`
    // to compare the previous and next state.
    // If we don't use a ref, the state will always be considered different, so
    // the component will always re-render.
    const resultCacheRef = useRef<AuthState>(
      this.core._reactor._currentUserCached,
    );

    // Similar to `resultCacheRef`, `useSyncExternalStore` will unsubscribe
    // if `subscribe` changes, so we use `useCallback` to memoize the function.
    const subscribe = useCallback((cb: Function) => {
      const unsubscribe = this.core.subscribeAuth((auth) => {
        resultCacheRef.current = { isLoading: false, ...auth };
        cb();
      });

      return unsubscribe;
    }, []);

    const state = useSyncExternalStore<AuthState>(
      subscribe,
      () => resultCacheRef.current,
      () => defaultAuthState,
    );
    return state;
  }

  /**
   * Subscribe to the currently logged in user.
   * If the user is not logged in, this hook with throw an Error.
   * You will want to protect any calls of this hook with a
   * <db.SignedIn> component, or your own logic based on db.useAuth()
   *
   * @see https://instantdb.com/docs/auth
   * @throws Error indicating user not signed in
   * @example
   *  function UserDisplay() {
   *    const user = db.useUser()
   *    return <div>Logged in as: {user.email}</div>
   *  }
   *
   *  <db.SignedIn>
   *    <UserDisplay />
   *  </db.SignedIn>
   *
   */
  useUser = (): User => {
    const { user } = this.useAuth();
    if (!user) {
      throw new InstantError(
        'useUser must be used within an auth-protected route',
      );
    }
    return user;
  };

  /**
   * One time query for the logged in state. This is useful
   * for scenarios where you want to know the current auth
   * state without subscribing to changes.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *   const user = await db.getAuth();
   *   console.log('logged in as', user.email)
   */
  getAuth(): Promise<User | null> {
    return this.core.getAuth();
  }

  /**
   * Listen for connection status changes to Instant. Use this for things like
   * showing connection state to users
   *
   * @see https://www.instantdb.com/docs/patterns#connection-status
   * @example
   *  function App() {
   *    const status = db.useConnectionStatus()
   *    const connectionState =
   *      status === 'connecting' || status === 'opened'
   *        ? 'authenticating'
   *      : status === 'authenticated'
   *        ? 'connected'
   *      : status === 'closed'
   *        ? 'closed'
   *      : status === 'errored'
   *        ? 'errored'
   *      : 'unexpected state';
   *
   *    return <div>Connection state: {connectionState}</div>
   *  }
   */
  useConnectionStatus = (): ConnectionStatus => {
    const statusRef = useRef<ConnectionStatus>(
      this.core._reactor.status as ConnectionStatus,
    );

    const subscribe = useCallback((cb: Function) => {
      const unsubscribe = this.core.subscribeConnectionStatus((newStatus) => {
        if (newStatus !== statusRef.current) {
          statusRef.current = newStatus;
          cb();
        }
      });

      return unsubscribe;
    }, []);

    const status = useSyncExternalStore<ConnectionStatus>(
      subscribe,
      () => statusRef.current,
      // For SSR, always return 'connecting' as the initial state
      () => 'connecting',
    );

    return status;
  };

  /**
   * Use this for one-off queries.
   * Returns local data if available, otherwise fetches from the server.
   * Because we want to avoid stale data, this method will throw an error
   * if the user is offline or there is no active connection to the server.
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *
   *  const resp = await db.queryOnce({ goals: {} });
   *  console.log(resp.data.goals)
   */
  queryOnce = <Q extends ValidQuery<Q, Schema>>(
    query: Q,
    opts?: InstaQLOptions,
  ): Promise<{
    data: InstaQLResponse<Schema, Q, UseDates>;
    pageInfo: PageInfoResponse<Q>;
  }> => {
    return this.core.queryOnce(query, opts);
  };

  /**
   *
   */
  useInfiniteQuery = <
    Entity extends keyof Schema['entities'],
    Q extends ValidInfiniteQueryObject<Q, Schema, Entity>,
  >(
    entity: Entity,
    _query: Q,
    opts?: InstaQLOptions,
  ): InfiniteQueryResult<Schema, Entity, Q, UseDates> => {
    const [state, setState] = useState<InfiniteScrollState>(
      createInitialInfiniteScrollState,
    );
    const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
    const tailSubscriptionKeyRef = useRef<string | null>(null);
    const serializedQuery = JSON.stringify(_query);
    const queryRef = useRef(_query);

    useEffect(() => {
      queryRef.current = _query;
    }, [serializedQuery]);

    const clearSubscriptionAtKey = useCallback((chunkKey: string) => {
      const unsub = subscriptionsRef.current.get(chunkKey);
      if (unsub) {
        unsub();
        subscriptionsRef.current.delete(chunkKey);
      }
    }, []);

    const clearAllSubscriptions = useCallback(() => {
      for (const unsub of subscriptionsRef.current.values()) {
        unsub?.();
      }
      subscriptionsRef.current = new Map();
      tailSubscriptionKeyRef.current = null;
    }, []);

    const upsertChunk = useCallback((nextChunk: Chunk) => {
      setState((prev) => {
        const index = prev.chunks.findIndex((chunk) => chunk.id === nextChunk.id);
        if (index === -1) {
          return {
            chunks: orderChunks([...prev.chunks, nextChunk]),
          };
        }

        const nextChunks = [...prev.chunks];
        nextChunks[index] = {
          ...nextChunks[index],
          ...nextChunk,
        };

        return {
          chunks: orderChunks(nextChunks),
        };
      });
    }, []);

    const setupFrozenChunk = useCallback(
      (start: Cursor, end: Cursor, initialData: any[], hasNextPage: boolean) => {
        const chunkId = getFrozenChunkId(start);

        if (subscriptionsRef.current.has(chunkId)) {
          return;
        }

        upsertChunk({
          id: chunkId,
          afterCursor: start,
          startCursor: start,
          endCursor: end,
          status: 'bootstrapping',
          queryKind: 'frozen',
          data: initialData,
          hasNextPage,
        });

        const queryConfig = queryRef.current;
        const stickyQuery = {
          [entity]: {
            ...queryConfig,
            $: {
              after: decrementCursor(start),
              before: incrementCursor(end),
              where: queryConfig.$.where,
              fields: queryConfig.$.fields,
              order: queryConfig.$.order,
            },
          },
        };

        const stickyUnsub = this.core.subscribeQuery(
          // @ts-expect-error entity key'd query
          stickyQuery,
          (resp) => {
            if (resp.error || !resp.data) {
              upsertChunk({
                id: chunkId,
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

            const frozenData = resp.data[entity];
            upsertChunk({
              id: chunkId,
              afterCursor: start,
              startCursor: resp.pageInfo?.[entity]?.startCursor ?? start,
              endCursor: resp.pageInfo?.[entity]?.endCursor ?? end,
              status: 'stable',
              queryKind: 'frozen',
              data: frozenData,
              hasNextPage: resp.pageInfo?.[entity].hasNextPage ?? hasNextPage,
            });
          },
          opts,
        );

        subscriptionsRef.current.set(chunkId, stickyUnsub);
      },
      [entity, opts, upsertChunk],
    );

    const setupTailChunk = useCallback(
      (afterCursor: Cursor | null) => {
        if (!afterCursor) {
          return;
        }

        const tailSubKey = `tail-live:${getChunkId(afterCursor)}`;
        if (tailSubscriptionKeyRef.current === tailSubKey) {
          return;
        }

        if (tailSubscriptionKeyRef.current) {
          clearSubscriptionAtKey(tailSubscriptionKeyRef.current);
        }
        tailSubscriptionKeyRef.current = tailSubKey;

        upsertChunk({
          id: tailChunkId,
          afterCursor,
          startCursor: null,
          endCursor: null,
          status: 'bootstrapping',
          queryKind: 'tail-live',
          data: [],
          hasNextPage: false,
        });

        const queryConfig = queryRef.current;
        const tailQuery = {
          [entity]: {
            ...queryConfig,
            $: {
              first: queryConfig.$.pageSize,
              after: afterCursor,
              where: queryConfig.$.where,
              fields: queryConfig.$.fields,
              order: queryConfig.$.order,
            },
          },
        };

        const tailUnsub = this.core.subscribeQuery(
          // @ts-expect-error entity key'd query
          tailQuery,
          (resp) => {
            if (resp.error || !resp.data) {
              upsertChunk({
                id: tailChunkId,
                afterCursor,
                startCursor: null,
                endCursor: null,
                status: 'error',
                queryKind: 'tail-live',
                data: [],
                hasNextPage: false,
              });
              return;
            }

            const tailData = resp.data[entity];
            upsertChunk({
              id: tailChunkId,
              afterCursor,
              startCursor: resp.pageInfo?.[entity]?.startCursor ?? null,
              endCursor: resp.pageInfo?.[entity]?.endCursor ?? null,
              status: 'stable',
              queryKind: 'tail-live',
              data: tailData,
              hasNextPage: resp.pageInfo?.[entity].hasNextPage ?? false,
            });
          },
          opts,
        );

        subscriptionsRef.current.set(tailSubKey, tailUnsub);
      },
      [clearSubscriptionAtKey, entity, opts, upsertChunk],
    );

    const setupChunk = useCallback(
      (afterCursor?: Cursor | null) => {
        const queryConfig = queryRef.current;
        const chunkId = headChunkId;

        if (afterCursor != null) {
          setupTailChunk(afterCursor);
          return;
        }

        if (subscriptionsRef.current.has(chunkId)) {
          return;
        }

        upsertChunk({
          id: chunkId,
          afterCursor: null,
          startCursor: null,
          endCursor: null,
          status: 'bootstrapping',
          queryKind: 'head-live',
          data: [],
          hasNextPage: false,
        });

        const query = {
          [entity]: {
            ...queryConfig,
            $: {
              first: queryConfig.$.pageSize,
              after: null,
              // common fields
              where: queryConfig.$.where,
              fields: queryConfig.$.fields,
              order: queryConfig.$.order,
            },
          },
        };

        const bootstrapUnsub = this.core.subscribeQuery(
          // @ts-expect-error entity key'd query
          query,
          (resp) => {
            if (resp.error || !resp.data) {
              clearSubscriptionAtKey(chunkId);
              upsertChunk({
                id: chunkId,
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
              id: chunkId,
              afterCursor: null,
              startCursor: start,
              endCursor: end,
              status: 'stable',
              queryKind: 'head-live',
              data,
              hasNextPage,
            });

            if (!isCursorWindowAligned(data, start, end, queryConfig.$.pageSize)) {
              return;
            }

            setupFrozenChunk(start, end, data, hasNextPage);
            setupTailChunk(end);
          },
          opts,
        );

        subscriptionsRef.current.set(chunkId, bootstrapUnsub);
      },
      [
        clearSubscriptionAtKey,
        entity,
        opts,
        setupFrozenChunk,
        setupTailChunk,
        upsertChunk,
      ],
    );

    useEffect(() => {
      setState(createInitialInfiniteScrollState());
      clearAllSubscriptions();
      setupChunk();

      return () => {
        clearAllSubscriptions();
      };
    }, [clearAllSubscriptions, entity, serializedQuery, setupChunk]);

    const headChunk = state.chunks.find((chunk) => chunk.id === headChunkId);
    const tailChunk = state.chunks.find((chunk) => chunk.id === tailChunkId);
    const frozenChunks = state.chunks.filter((chunk) => chunk.queryKind === 'frozen');

    const isLoading =
      state.chunks.length === 0 || headChunk?.status === 'bootstrapping';
    const isLoadingMore =
      frozenChunks.length > 0 && tailChunk?.status === 'bootstrapping';
    const canLoadMore =
      tailChunk?.status === 'stable' &&
      !!tailChunk.startCursor &&
      !!tailChunk.endCursor &&
      tailChunk.data.length > 0;

    const mergedData = deriveMergedInfiniteData(state);

    const loadMore = async () => {
      if (
        !tailChunk ||
        tailChunk.status !== 'stable' ||
        !tailChunk.startCursor ||
        !tailChunk.endCursor
      ) {
        return;
      }

      setupFrozenChunk(
        tailChunk.startCursor,
        tailChunk.endCursor,
        tailChunk.data,
        tailChunk.hasNextPage,
      );
      setupTailChunk(tailChunk.endCursor);
    };

    return {
      data: mergedData,
      isLoading,
      isLoadingMore,
      chunks: state.chunks,
      loadMore,
      canLoadMore,
    };
  };

  /**
   * Only render children if the user is signed in.
   * @see https://instantdb.com/docs/auth
   *
   * @example
   *  <db.SignedIn>
   *    <MyComponent />
   *  </db.SignedIn>
   *
   */
  SignedIn: React.FC<{
    children: ReactNode;
  }> = ({ children }) => {
    const auth = this.useAuth();
    if (auth.isLoading || auth.error || !auth.user) return null;

    return <>{children}</>;
  };

  /**
   * Only render children if the user is signed out.
   * @see https://instantdb.com/docs/auth
   *
   * @example
   *  <db.SignedOut>
   *    <MyComponent />
   *  </db.SignedOut>
   *
   */
  SignedOut: React.FC<{
    children: ReactNode;
  }> = ({ children }) => {
    const auth = this.useAuth();
    if (auth.isLoading || auth.error || auth.user) return null;
    return <>{children}</>;
  };
}
