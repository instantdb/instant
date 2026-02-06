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

import { createSignal, createEffect, onCleanup, createMemo } from 'solid-js';
import type { Accessor } from 'solid-js';

import { InstantSolidRoom, rooms } from './InstantSolidRoom.js';
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

export class InstantSolidDatabase<
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
  // Solid reactive hooks

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *   const state = db.useQuery({ goals: {} });
   *   // state().isLoading, state().error, state().data
   */
  useQuery = <Q extends ValidQuery<Q, Schema>>(
    query: null | Q,
    opts?: InstaQLOptions,
  ): Accessor<InstaQLLifecycleState<Schema, Q, UseDates>> => {
    const [state, setState] = createSignal<
      InstaQLLifecycleState<Schema, Q, UseDates>
    >(defaultState as InstaQLLifecycleState<Schema, Q, UseDates>);

    createEffect(() => {
      if (!query) {
        setState(
          () => defaultState as InstaQLLifecycleState<Schema, Q, UseDates>,
        );
        return;
      }

      let q = query;
      if (opts && 'ruleParams' in opts) {
        q = { $$ruleParams: (opts as any)['ruleParams'], ...q };
      }

      const coerced = coerceQuery(q);
      const prev = this.core._reactor.getPreviousResult(coerced);
      if (prev) {
        setState(
          () =>
            stateForResult(prev) as InstaQLLifecycleState<Schema, Q, UseDates>,
        );
      }

      const unsub = this.core.subscribeQuery<Q, UseDates>(coerced, (result) => {
        setState(
          () =>
            Object.assign(
              {
                isLoading: false,
                data: undefined,
                pageInfo: undefined,
                error: undefined,
              },
              result,
            ) as InstaQLLifecycleState<Schema, Q, UseDates>,
        );
      });

      onCleanup(unsub);
    });

    return state;
  };

  /**
   * Listen for the logged in state. This is useful
   * for deciding when to show a login screen.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  function App() {
   *    const auth = db.useAuth();
   *    // auth().isLoading, auth().user, auth().error
   *  }
   */
  useAuth = (): Accessor<AuthState> => {
    const [state, setState] = createSignal<AuthState>(
      this.core._reactor._currentUserCached ?? defaultAuthState,
    );

    createEffect(() => {
      const unsub = this.core.subscribeAuth((auth) => {
        setState({ isLoading: false, ...auth });
      });

      onCleanup(unsub);
    });

    return state;
  };

  /**
   * Subscribe to the currently logged in user.
   * If the user is not logged in, this will throw an Error.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  function UserDisplay() {
   *    const user = db.useUser();
   *    return <div>Logged in as: {user().email}</div>
   *  }
   */
  useUser = (): Accessor<User> => {
    const auth = this.useAuth();
    return createMemo(() => {
      const { user } = auth();
      if (!user) {
        throw new InstantError(
          'useUser must be used within an auth-protected route',
        );
      }
      return user;
    });
  };

  /**
   * Listen for connection status changes to Instant.
   *
   * @see https://www.instantdb.com/docs/patterns#connection-status
   * @example
   *  function App() {
   *    const status = db.useConnectionStatus();
   *    return <div>Connection state: {status()}</div>
   *  }
   */
  useConnectionStatus = (): Accessor<ConnectionStatus> => {
    const [status, setStatus] = createSignal<ConnectionStatus>(
      this.core._reactor.status as ConnectionStatus,
    );

    createEffect(() => {
      const unsub = this.core.subscribeConnectionStatus((newStatus) => {
        setStatus(() => newStatus);
      });

      onCleanup(unsub);
    });

    return status;
  };

  /**
   * A hook that returns a unique ID for a given `name`. localIds are
   * stored in local storage, so you will get the same ID across sessions.
   *
   * Initially returns `null`, and then loads the localId.
   *
   * @example
   * const deviceId = db.useLocalId('device');
   * // deviceId() is null initially, then the ID string
   */
  useLocalId = (name: string): Accessor<string | null> => {
    const [localId, setLocalId] = createSignal<string | null>(null);

    createEffect(() => {
      let mounted = true;
      this.getLocalId(name).then((id) => {
        if (mounted) {
          setLocalId(() => id);
        }
      });
      onCleanup(() => {
        mounted = false;
      });
    });

    return localId;
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
    return new InstantSolidRoom<Schema, Rooms, RoomType>(this.core, type, id);
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
 *  import { init } from "@instantdb/solidjs"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/solidjs"
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
): InstantSolidDatabase<Schema, UseDates> {
  const coreDb = core_init<Schema, UseDates>(config, undefined, undefined, {
    '@instantdb/solidjs': version,
  });
  return new InstantSolidDatabase<Schema, UseDates>(coreDb);
}

export const init_experimental = init;
