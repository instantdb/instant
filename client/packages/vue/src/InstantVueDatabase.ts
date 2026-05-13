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
  type InstaQLResponse,
  type ValidQuery,
  // classes
  Auth,
  Storage,
  Streams,
  txInit,
  InstantCoreDatabase,
  init as core_init,
  coerceQuery,
  weakHash,
  InstantSchemaDef,
  RoomsOf,
  InstantError,
  IInstantDatabase,
} from '@instantdb/core';

import { ref, shallowRef, computed, watch, toValue } from 'vue';
import type { Ref, ShallowRef, ComputedRef, MaybeRefOrGetter } from 'vue';

import { InstantVueRoom, rooms } from './InstantVueRoom.js';
import { tryOnScopeDispose } from './utils.js';
import { useInfiniteQuery } from './useInfiniteQuery.js';
import type { InfiniteQueryResult } from './useInfiniteQuery.js';
import version from './version.js';

// ------
// Types

export type UseQueryReturn<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> = {
  isLoading: Ref<boolean>;
  data: ShallowRef<InstaQLResponse<Schema, Q, UseDates> | undefined>;
  pageInfo: ShallowRef<PageInfoResponse<Q> | undefined>;
  error: ShallowRef<{ message: string } | undefined>;
};

export type UseAuthReturn = {
  isLoading: Ref<boolean>;
  user: ShallowRef<User | null | undefined>;
  error: ShallowRef<{ message: string } | undefined>;
};

export class InstantVueDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
  Rooms extends RoomSchemaShape = RoomsOf<Schema>,
> implements IInstantDatabase<Schema>
{
  public tx = txInit<Schema>();

  public auth: Auth;
  public storage: Storage;
  public streams: Streams;
  public core: InstantCoreDatabase<Schema, UseDates>;

  constructor(core: InstantCoreDatabase<Schema, UseDates>) {
    this.core = core;
    this.auth = this.core.auth;
    this.storage = this.core.storage;
    this.streams = this.core.streams;
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
  // Vue reactive hooks

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *   // basic query — refs auto-unwrap in templates
   *   const { isLoading, error, data } = db.useQuery({ goals: {} });
   *
   * @example
   *   // reactive query — pass a getter that returns null to skip
   *   const { user } = db.useAuth();
   *   const { data } = db.useQuery(() =>
   *     user.value ? { todos: { $: { where: { 'owner.id': user.value.id } } } } : null,
   *   );
   *
   * @example
   *   // pass a ref directly
   *   const query = ref<{ todos: {} } | null>({ todos: {} });
   *   const { data } = db.useQuery(query);
   */
  useQuery = <Q extends ValidQuery<Q, Schema>>(
    query: MaybeRefOrGetter<Q | null>,
    opts?: MaybeRefOrGetter<InstaQLOptions | null | undefined>,
  ): UseQueryReturn<Schema, Q, UseDates> => {
    const isLoading = ref(true);
    const data = shallowRef<InstaQLResponse<Schema, Q, UseDates> | undefined>(
      undefined,
    );
    const pageInfo = shallowRef<PageInfoResponse<Q> | undefined>(undefined);
    const error = shallowRef<{ message: string } | undefined>(undefined);

    const resolvedQuery = computed(() => {
      const q = toValue(query);
      if (!q) return null;
      const o = toValue(opts);
      const withParams =
        o && 'ruleParams' in o
          ? ({ $$ruleParams: (o as any).ruleParams, ...q } as Q)
          : q;
      return coerceQuery(withParams);
    });

    const queryHash = computed(() => weakHash(resolvedQuery.value));

    const stop = watch(
      queryHash,
      (_, __, onCleanup) => {
        const q = resolvedQuery.value;
        const cached: any = q ? this.core._reactor.getPreviousResult(q) : null;
        isLoading.value = !cached;
        data.value = cached?.data;
        pageInfo.value = cached?.pageInfo;
        error.value = cached?.error;

        if (!q) return;

        const unsub = this.core.subscribeQuery<Q, UseDates>(q, (r: any) => {
          isLoading.value = false;
          data.value = r.data;
          pageInfo.value = r.pageInfo;
          error.value = r.error;
        });
        onCleanup(unsub);
      },
      { immediate: true },
    );

    tryOnScopeDispose(stop);

    return { isLoading, data, pageInfo, error } as UseQueryReturn<
      Schema,
      Q,
      UseDates
    >;
  };

  /**
   * Subscribe to a query and incrementally load more items.
   *
   * Only one top-level namespace in the query is allowed.
   *
   * @example
   *  const { data, isLoading, error, loadNextPage, canLoadNextPage } =
   *    db.useInfiniteQuery({
   *      posts: { $: { limit: 20, order: { createdAt: 'desc' } } },
   *    });
   */
  useInfiniteQuery = <Q extends ValidQuery<Q, Schema>>(
    query: MaybeRefOrGetter<Q | null>,
    opts?: MaybeRefOrGetter<InstaQLOptions | undefined>,
  ): InfiniteQueryResult<Schema, Q, UseDates> => {
    return useInfiniteQuery<Schema, Q, UseDates>(this.core, query, opts);
  };

  /**
   * Listen for the logged in state. This is useful
   * for deciding when to show a login screen.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  const { isLoading, user, error } = db.useAuth();
   */
  useAuth = (): UseAuthReturn => {
    const cached = this.core._reactor._currentUserCached as
      | AuthState
      | undefined;

    const isLoading = ref(cached?.isLoading ?? true);
    const user = shallowRef<User | null | undefined>(cached?.user);
    const error = shallowRef<{ message: string } | undefined>(cached?.error);

    const unsub = this.core.subscribeAuth((auth: any) => {
      isLoading.value = false;
      user.value = auth.user ?? null;
      error.value = auth.error;
    });

    tryOnScopeDispose(unsub);

    return { isLoading, user, error };
  };

  /**
   * Subscribe to the currently logged in user. Throws if the user isn't
   * signed in when `.value` is accessed — wrap callers with `<SignedIn>` or
   * a `useAuth` check.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  const user = db.useUser();
   *  // user.value.email
   */
  useUser = (): ComputedRef<User> => {
    const { user } = this.useAuth();
    return computed(() => {
      if (!user.value) {
        throw new InstantError(
          'useUser must be used within an auth-protected route',
        );
      }
      return user.value;
    });
  };

  /**
   * Listen for connection status changes to Instant.
   *
   * @see https://www.instantdb.com/docs/patterns#connection-status
   * @example
   *  const status = db.useConnectionStatus();
   *  // status.value
   */
  useConnectionStatus = (): Ref<ConnectionStatus> => {
    const status = ref<ConnectionStatus>(
      this.core._reactor.status as ConnectionStatus,
    );

    const unsub = this.core.subscribeConnectionStatus((newStatus) => {
      status.value = newStatus;
    });

    tryOnScopeDispose(unsub);

    return status;
  };

  /**
   * A hook that returns a unique ID for a given `name`. localIds are stored in
   * local storage, so you get the same ID across sessions.
   *
   * Returns `null` initially, then the loaded ID.
   *
   * @example
   *  const deviceId = db.useLocalId('device');
   *  // deviceId.value is null initially, then the ID string
   */
  useLocalId = (name: MaybeRefOrGetter<string>): Ref<string | null> => {
    const localId = ref<string | null>(null);

    const stop = watch(
      () => toValue(name),
      (currentName) => {
        this.getLocalId(currentName).then((id) => {
          // Drop a late resolve if `name` has since changed.
          if (toValue(name) === currentName) {
            localId.value = id;
          }
        });
      },
      { immediate: true },
    );

    tryOnScopeDispose(stop);
    return localId;
  };

  /**
   * Obtain a handle to a room, which allows you to listen to topics and presence data
   *
   * @see https://instantdb.com/docs/presence-and-topics
   *
   * @example
   *  const room = db.room('chat', roomId);
   *  const { peers } = db.rooms.usePresence(room);
   */
  room<RoomType extends string & keyof Rooms>(
    type?: MaybeRefOrGetter<RoomType | undefined>,
    id?: MaybeRefOrGetter<string | undefined>,
  ) {
    const _type = computed(
      () => (toValue(type) ?? '_defaultRoomType') as RoomType,
    );
    const _id = computed(() => toValue(id) ?? '_defaultRoomId');
    return new InstantVueRoom<Schema, Rooms, RoomType>(this.core, _type, _id);
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
 *  import { init } from "@instantdb/vue"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/vue"
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
): InstantVueDatabase<Schema, UseDates> {
  const coreDb = core_init<Schema, UseDates>(config, undefined, undefined, {
    '@instantdb/vue': version,
  });
  return new InstantVueDatabase<Schema, UseDates>(coreDb);
}
