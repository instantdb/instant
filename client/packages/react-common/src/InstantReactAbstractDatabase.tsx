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

const defaultAuthState = {
  isLoading: true,
  user: undefined,
  error: undefined,
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
  public core: InstantCoreDatabase<Schema, UseDates>;

  /** @deprecated use `core` instead */
  public _core: InstantCoreDatabase<Schema, UseDates>;

  static Storage?: any;
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
      this.constructor.Storage,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.NetworkListener,
      versions,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.EventSourceImpl,
    );
    this._core = this.core;
    this.auth = this.core.auth;
    this.storage = this.core.storage;
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
  room<RoomType extends keyof Rooms>(
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
