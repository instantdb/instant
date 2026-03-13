import {
  // types
  type AuthState,
  type User,
  type ConnectionStatus,
  type TransactionChunk,
  type RoomSchemaShape,
  type InstaQLOptions,
  type InstantConfig,
  type PageInfoResponse,
  type InstaQLLifecycleState,
  type InstaQLResponse,
  type ValidQuery,
  // classes
  Auth,
  Storage,
  txInit,
  InstantCoreDatabase,
  init as core_init,
  coerceQuery,
  InstantSchemaDef,
  RoomsOf,
  InstantError,
  IInstantDatabase,
} from '@instantdb/core';

import { InstantSvelteRoom, rooms } from './InstantSvelteRoom.svelte.js';
import version from './version.js';

const defaultState = {
  isLoading: true,
  data: undefined,
  pageInfo: undefined,
  error: undefined,
} as const;

const defaultAuthState: AuthState = {
  isLoading: true,
  user: undefined,
  error: undefined,
};

function stateForResult(result: any) {
  return {
    isLoading: !Boolean(result),
    data: undefined,
    pageInfo: undefined,
    error: undefined,
    ...(result ? result : {}),
  };
}

export class InstantSvelteDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
  Rooms extends RoomSchemaShape = RoomsOf<Schema>,
> implements IInstantDatabase<Schema>
{
  public tx = txInit<Schema>();

  public auth: Auth;
  public storage: Storage;
  public core: InstantCoreDatabase<Schema, UseDates>;

  constructor(core: InstantCoreDatabase<Schema, UseDates>) {
    this.core = core;
    this.auth = this.core.auth;
    this.storage = this.core.storage;
  }

  /**
   * Returns a unique ID for a given `name`. It's stored in local storage,
   * so you will get the same ID across sessions.
   *
   * @example
   *  const deviceId = await db.getLocalId('device');
   */
  getLocalId = (name: string): Promise<string> => {
    return this.core.getLocalId(name);
  };

  /**
   * Use this to write data! You can create, update, delete, and link objects
   *
   * @see https://instantdb.com/docs/instaml
   *
   * @example
   *   const goalId = id();
   *   db.transact(db.tx.goals[goalId].update({title: "Get fit"}))
   */
  transact = (
    chunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => {
    return this.core.transact(chunks);
  };

  /**
   * One time query for the logged in state.
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
   * Use this for one-off queries.
   * Returns local data if available, otherwise fetches from the server.
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
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

  // -----------
  // Svelte reactive hooks

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *   const state = db.useQuery({ goals: {} });
   *   // state.isLoading, state.error, state.data
   */
  useQuery = <Q extends ValidQuery<Q, Schema>>(
    query: (() => null | Q) | null | Q,
    opts?: InstaQLOptions,
  ): InstaQLLifecycleState<Schema, Q, UseDates> => {
    let result: InstaQLLifecycleState<Schema, Q, UseDates> = $state({
      ...defaultState,
    } as InstaQLLifecycleState<Schema, Q, UseDates>);

    $effect(() => {
      const resolvedQuery = typeof query === 'function' ? query() : query;

      if (!resolvedQuery) {
        result.isLoading = true;
        result.data = undefined as any;
        result.pageInfo = undefined as any;
        result.error = undefined;
        return;
      }

      let q = resolvedQuery;
      if (opts && 'ruleParams' in opts) {
        q = { $$ruleParams: (opts as any)['ruleParams'], ...q };
      }

      const coerced = coerceQuery(q);
      const prev = this.core._reactor.getPreviousResult(coerced);
      const prevState = stateForResult(prev);
      result.isLoading = prevState.isLoading;
      result.data = prevState.data;
      result.pageInfo = prevState.pageInfo;
      result.error = prevState.error;

      const unsub = this.core.subscribeQuery<Q, UseDates>(coerced, (r: any) => {
        result.isLoading = false;
        result.data = r.data;
        result.pageInfo = r.pageInfo;
        result.error = r.error;
      });

      return unsub;
    });

    return result;
  };

  /**
   * Listen for the logged in state. This is useful
   * for deciding when to show a login screen.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  const auth = db.useAuth();
   *  // auth.isLoading, auth.user, auth.error
   */
  useAuth = (): AuthState => {
    let result: AuthState = $state(
      this.core._reactor._currentUserCached
        ? { ...this.core._reactor._currentUserCached }
        : { ...defaultAuthState },
    );

    $effect(() => {
      const unsub = this.core.subscribeAuth((auth: any) => {
        result.isLoading = false;
        result.user = auth.user;
        result.error = auth.error;
      });

      return unsub;
    });

    return result;
  };

  /**
   * Subscribe to the currently logged in user.
   * If the user is not logged in, this will throw an Error.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  const user = db.useUser();
   *  // user.email, user.id, etc.
   *  // Throws if not logged in
   */
  useUser = (): User => {
    const auth = this.useAuth();

    // Return a proxy that always reads from the latest auth state
    return new Proxy({} as User, {
      get(_target, prop, receiver) {
        if (!auth.user) {
          throw new InstantError(
            'useUser must be used within an auth-protected route',
          );
        }
        return Reflect.get(auth.user, prop, receiver);
      },
    });
  };

  /**
   * Listen for connection status changes to Instant.
   *
   * @see https://www.instantdb.com/docs/patterns#connection-status
   * @example
   *  const status = db.useConnectionStatus();
   *  // status.current
   */
  useConnectionStatus = (): { current: ConnectionStatus } => {
    let result = $state({
      current: this.core._reactor.status as ConnectionStatus,
    });

    $effect(() => {
      const unsub = this.core.subscribeConnectionStatus((newStatus) => {
        result.current = newStatus;
      });

      return unsub;
    });

    return result;
  };

  /**
   * A hook that returns a unique ID for a given `name`. localIds are
   * stored in local storage, so you will get the same ID across sessions.
   *
   * Initially returns `null`, and then loads the localId.
   *
   * @example
   * const deviceId = db.useLocalId('device');
   * // deviceId.current is null initially, then the ID string
   */
  useLocalId = (name: string): { current: string | null } => {
    let result = $state({ current: null as string | null });

    $effect(() => {
      let mounted = true;
      this.getLocalId(name).then((id) => {
        if (mounted) {
          result.current = id;
        }
      });
      return () => {
        mounted = false;
      };
    });

    return result;
  };

  /**
   * Obtain a handle to a room, which allows you to listen to topics and presence data
   *
   * @see https://instantdb.com/docs/presence-and-topics
   *
   * @example
   *  const room = db.room('chat', roomId);
   *  const presence = db.rooms.usePresence(room);
   */
  room<RoomType extends keyof Rooms>(
    type: RoomType = '_defaultRoomType' as RoomType,
    id: string = '_defaultRoomId',
  ) {
    return new InstantSvelteRoom<Schema, Rooms, RoomType>(this.core, type, id);
  }

  /**
   * Hooks for working with rooms
   *
   * @see https://instantdb.com/docs/presence-and-topics
   *
   * @example
   *  const room = db.room('chat', roomId);
   *  const presence = db.rooms.usePresence(room);
   *  const publish = db.rooms.usePublishTopic(room, 'emoji');
   */
  rooms = rooms;
}

// -----------
// init

/**
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/svelte"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/svelte"
 *  import schema from "../instant.schema.ts";
 *
 *  const db = init({ appId: "my-app-id", schema })
 */
export function init<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
>(
  config: Omit<InstantConfig<Schema, UseDates>, 'useDateObjects'> & {
    useDateObjects?: UseDates;
  },
): InstantSvelteDatabase<Schema, UseDates> {
  const coreDb = core_init<Schema, UseDates>(config, undefined, undefined, {
    '@instantdb/svelte': version,
  });
  return new InstantSvelteDatabase<Schema, UseDates>(coreDb);
}
