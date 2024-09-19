import {
  // types
  InstantClient,
  Auth,
  Storage,
  txInit,
  _init_internal,
  i,
  type AuthState,
  type Config,
  type Query,
  type Exactly,
  type TransactionChunk,
  type LifecycleSubscriptionState,
  type PresenceOpts,
  type PresenceResponse,
  type RoomSchemaShape,
  type InstaQLQueryParams,
  type ConfigWithSchema,
  type IDatabase,
  type InstantGraph,
} from "@instantdb/core";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery } from "./useQuery";
import { useTimeout } from "./useTimeout";

export type PresenceHandle<
  PresenceShape,
  Keys extends keyof PresenceShape,
> = PresenceResponse<PresenceShape, Keys> & {
  publishPresence: (data: Partial<PresenceShape>) => void;
};

export type TypingIndicatorOpts = {
  timeout?: number | null;
  stopOnEnter?: boolean;
  // Perf opt - `active` will always be an empty array
  writeOnly?: boolean;
};

export type TypingIndicatorHandle<PresenceShape> = {
  active: PresenceShape[];
  setActive(active: boolean): void;
  inputProps: {
    onKeyDown: (e: KeyboardEvent) => void;
    onBlur: () => void;
  };
};

export const defaultActivityStopTimeout = 1_000;

export class InstantReactRoom<
  Schema,
  RoomSchema extends RoomSchemaShape,
  RoomType extends keyof RoomSchema,
> {
  _core: InstantClient<Schema, RoomSchema>;
  type: RoomType;
  id: string;

  constructor(
    _core: InstantClient<Schema, RoomSchema, any>,
    type: RoomType,
    id: string,
  ) {
    this._core = _core;
    this.type = type;
    this.id = id;
  }

  /**
   * Listen for broadcasted events given a room and topic.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    db.room(roomType, roomId).useTopicEffect("chat", (message, peer) => {
   *      console.log("New message", message, 'from', peer.name);
   *    });
   *
   *    // ...
   *  }
   */
  useTopicEffect = <TopicType extends keyof RoomSchema[RoomType]["topics"]>(
    topic: TopicType,
    onEvent: (
      event: RoomSchema[RoomType]["topics"][TopicType],
      peer: RoomSchema[RoomType]["presence"],
    ) => any,
  ): void => {
    useEffect(() => {
      const unsub = this._core._reactor.subscribeTopic(
        this.id,
        topic,
        (event, peer) => {
          onEvent(event, peer);
        },
      );

      return unsub;
    }, [this.id, topic]);
  };

  /**
   * Broadcast an event to a room.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   * function App({ roomId }) {
   *   const publishTopic = db.room(roomType, roomId).usePublishTopic("clicks");
   *
   *   return (
   *     <button onClick={() => publishTopic({ ts: Date.now() })}>Click me</button>
   *   );
   * }
   *
   */
  usePublishTopic = <Topic extends keyof RoomSchema[RoomType]["topics"]>(
    topic: Topic,
  ): ((data: RoomSchema[RoomType]["topics"][Topic]) => void) => {
    useEffect(() => this._core._reactor.joinRoom(this.id), [this.id]);

    const publishTopic = useCallback(
      (data) => {
        this._core._reactor.publishTopic({
          roomType: this.type,
          roomId: this.id,
          topic,
          data,
        });
      },
      [this.id, topic],
    );

    return publishTopic;
  };

  /**
   * Listen for peer's presence data in a room, and publish the current user's presence.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    const {
   *      peers,
   *      publishPresence
   *    } = db.room(roomType, roomId).usePresence({ keys: ["name", "avatar"] });
   *
   *    // ...
   *  }
   */
  usePresence = <Keys extends keyof RoomSchema[RoomType]["presence"]>(
    opts: PresenceOpts<RoomSchema[RoomType]["presence"], Keys> = {},
  ): PresenceHandle<RoomSchema[RoomType]["presence"], Keys> => {
    const [state, setState] = useState<
      PresenceResponse<RoomSchema[RoomType]["presence"], Keys>
    >(() => {
      return (
        this._core._reactor.getPresence(this.type, this.id, opts) ?? {
          peers: {},
          isLoading: true,
        }
      );
    });

    useEffect(() => {
      const unsub = this._core._reactor.subscribePresence(
        this.type,
        this.id,
        opts,
        (data) => {
          setState(data);
        },
      );

      return unsub;
    }, [this.id, opts.user, opts.peers?.join(), opts.keys?.join()]);

    return {
      ...state,
      publishPresence: (data) => {
        this._core._reactor.publishPresence(this.type, this.id, data);
      },
    };
  };

  /**
   * Publishes presence data to a room
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    db.room(roomType, roomId).useSyncPresence({ name, avatar, color });
   *
   *    // ...
   *  }
   */
  useSyncPresence = (
    data: Partial<RoomSchema[RoomType]["presence"]>,
    deps?: any[],
  ): void => {
    useEffect(() => this._core._reactor.joinRoom(this.id), [this.id]);
    useEffect(() => {
      return this._core._reactor.publishPresence(this.type, this.id, data);
    }, [this.type, this.id, deps ?? JSON.stringify(data)]);
  };

  /**
   * Manage typing indicator state
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   *  function App({ roomId }) {
   *    const {
   *      active,
   *      setActive,
   *      inputProps,
   *    } = db.room(roomType, roomId).useTypingIndicator("chat-input", opts);
   *
   *    return <input {...inputProps} />;
   *  }
   */
  useTypingIndicator = (
    inputName: string,
    opts: TypingIndicatorOpts = {},
  ): TypingIndicatorHandle<RoomSchema[RoomType]["presence"]> => {
    const timeout = useTimeout();

    const onservedPresence = this.usePresence({
      keys: [inputName],
    });

    const active = useMemo(() => {
      const presenceSnapshot = this._core._reactor.getPresence(
        this.type,
        this.id,
      );

      return opts?.writeOnly
        ? []
        : Object.values(presenceSnapshot?.peers ?? {}).filter(
            (p) => p[inputName] === true,
          );
    }, [opts?.writeOnly, onservedPresence]);

    const setActive = (isActive: boolean) => {
      this._core._reactor.publishPresence(this.type, this.id, {
        [inputName]: isActive,
      } as unknown as Partial<RoomSchema[RoomType]>);

      if (!isActive) return;

      if (opts?.timeout === null || opts?.timeout === 0) return;

      timeout.set(opts?.timeout ?? defaultActivityStopTimeout, () => {
        this._core._reactor.publishPresence(this.type, this.id, {
          [inputName]: null,
        } as Partial<RoomSchema[RoomType]>);
      });
    };

    return {
      active,
      setActive: (a: boolean) => {
        setActive(a);
      },
      inputProps: {
        onKeyDown: (e: KeyboardEvent) => {
          const isEnter = opts?.stopOnEnter && e.key === "Enter";
          const isActive = !isEnter;

          setActive(isActive);
        },
        onBlur: () => {
          setActive(false);
        },
      },
    };
  };
}

const defaultAuthState = {
  isLoading: true,
  user: undefined,
  error: undefined,
};

export abstract class InstantReact<
  Schema extends InstantGraph<any, any> | {} = {},
  RoomSchema extends RoomSchemaShape = {},
  WithCardinalityInference extends boolean = false,
> implements IDatabase<Schema, RoomSchema, WithCardinalityInference>
{
  public withCardinalityInference?: WithCardinalityInference;
  public tx =
    txInit<
      Schema extends InstantGraph<any, any> ? Schema : InstantGraph<any, any>
    >();

  public auth: Auth;
  public storage: Storage;
  public _core: InstantClient<Schema, RoomSchema, WithCardinalityInference>;

  static Storage?: any;
  static NetworkListener?: any;

  constructor(config: Config | ConfigWithSchema<any>) {
    this._core = _init_internal<Schema, RoomSchema, WithCardinalityInference>(
      config,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.Storage,
      // @ts-expect-error because TS can't resolve subclass statics
      this.constructor.NetworkListener,
    );
    this.auth = this._core.auth;
    this.storage = this._core.storage;
  }

  getLocalId = (name: string) => {
    return this._core.getLocalId(name);
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
   *  const {
   *   useTopicEffect,
   *   usePublishTopic,
   *   useSyncPresence,
   *   useTypingIndicator,
   * } = db.room(roomType, roomId);
   */
  room<RoomType extends keyof RoomSchema>(
    type: RoomType = "_defaultRoomType" as RoomType,
    id: string = "_defaultRoomId",
  ) {
    return new InstantReactRoom<Schema, RoomSchema, RoomType>(
      this._core,
      type,
      id,
    );
  }

  /**
   * Use this to write data! You can create, update, delete, and link objects
   *
   * @see https://instantdb.com/docs/instaml
   *
   * @example
   *   // Create a new object in the `goals` namespace
   *   const goalId = id();
   *   db.transact(tx.goals[goalId].update({title: "Get fit"}))
   *
   *   // Update the title
   *   db.transact(tx.goals[goalId].update({title: "Get super fit"}))
   *
   *   // Delete it
   *   db.transact(tx.goals[goalId].delete())
   *
   *   // Or create an association:
   *   todoId = id();
   *   db.transact([
   *    tx.todos[todoId].update({ title: 'Go on a run' }),
   *    tx.goals[goalId].link({todos: todoId}),
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
   *  // listen to all goals
   *  db.useQuery({ goals: {} })
   *
   *  // goals where the title is "Get Fit"
   *  db.useQuery({ goals: { $: { where: { title: "Get Fit" } } } })
   *
   *  // all goals, _alongside_ their todos
   *  db.useQuery({ goals: { todos: {} } })
   *
   *  // skip if `user` is not logged in
   *  db.useQuery(auth.user ? { goals: {} } : null)
   */
  useQuery = <
    Q extends Schema extends InstantGraph<any, any>
      ? InstaQLQueryParams<Schema>
      : Exactly<Query, Q>,
  >(
    query: null | Q,
  ): LifecycleSubscriptionState<Q, Schema, WithCardinalityInference> => {
    return useQuery(this._core, query).state;
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
}
