import {
  // types
  Auth,
  Storage,
  txInit,
  type AuthState,
  type User,
  type ConnectionStatus,
  type TransactionChunk,
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  type InstaQLParams,
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
} from '@instantdb/core';
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQueryInternal } from './useQuery.ts';
import { useTimeout } from './useTimeout.ts';
import { InstantReactRoom, rooms } from './InstantReactRoom.ts';

const defaultAuthState = {
  isLoading: true,
  user: undefined,
  error: undefined,
};

export default abstract class InstantReactAbstractDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  Rooms extends RoomSchemaShape = RoomsOf<Schema>,
> implements IInstantDatabase<Schema>
{
  public tx = txInit<Schema>();

  public auth: Auth;
  public storage: Storage;
  public _core: InstantCoreDatabase<Schema>;

  static Storage?: any;
  static NetworkListener?: any;

  constructor(
    config: InstantConfig<Schema>,
    versions?: { [key: string]: string },
  ) {
    this._core = core_init<Schema>(
      config,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.Storage,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.NetworkListener,
      versions,
    );
    this.auth = this._core.auth;
    this.storage = this._core.storage;
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
    return this._core.getLocalId(name);
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
  room<RoomType extends keyof Rooms>(
    type: RoomType = '_defaultRoomType' as RoomType,
    id: string = '_defaultRoomId',
  ) {
    return new InstantReactRoom<Schema, Rooms, RoomType>(this._core, type, id);
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
    return this._core.transact(chunks);
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
  useQuery = <Q extends InstaQLParams<Schema>>(
    query: null | Q,
    opts?: InstaQLOptions,
  ): InstaQLLifecycleState<Schema, Q> => {
    return useQueryInternal<Q, Schema>(this._core, query, opts).state;
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
    // We use a ref to store the result of the query.
    // This is becuase `useSyncExternalStore` uses `Object.is`
    // to compare the previous and next state.
    // If we don't use a ref, the state will always be considered different, so
    // the component will always re-render.
    const resultCacheRef = useRef<AuthState>(
      this._core._reactor._currentUserCached,
    );

    // Similar to `resultCacheRef`, `useSyncExternalStore` will unsubscribe
    // if `subscribe` changes, so we use `useCallback` to memoize the function.
    const subscribe = useCallback((cb: Function) => {
      const unsubscribe = this._core.subscribeAuth((auth) => {
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
    return this._core.getAuth();
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
      this._core._reactor.status as ConnectionStatus,
    );

    const subscribe = useCallback((cb: Function) => {
      const unsubscribe = this._core.subscribeConnectionStatus((newStatus) => {
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
  queryOnce = <Q extends InstaQLParams<Schema>>(
    query: Q,
    opts?: InstaQLOptions,
  ): Promise<{
    data: InstaQLResponse<Schema, Q>;
    pageInfo: PageInfoResponse<Q>;
  }> => {
    return this._core.queryOnce(query, opts);
  };
}
