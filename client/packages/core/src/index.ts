import Reactor from "./Reactor";
import {
  tx,
  txInit,
  lookup,
  getOps,
  type TxChunk,
  type TransactionChunk,
} from "./instatx";
import weakHash from "./utils/weakHash";
import id from "./utils/uuid";
import IndexedDBStorage from "./IndexedDBStorage";
import WindowNetworkListener from "./WindowNetworkListener";
import { i } from "./schema";
import { createDevtool } from "./devtool";
import version from "./version";

import type {
  PresenceOpts,
  PresenceResponse,
  PresenceSlice,
  RoomSchemaShape,
} from "./presence";
import type { IDatabase, IInstantDatabase } from "./coreTypes";
import type {
  Query,
  QueryResponse,
  InstaQLResponse,
  PageInfoResponse,
  Exactly,
  InstantObject,
  InstaQLParams,
  InstaQLQueryParams,
  InstaQLEntity,
  InstaQLResult,
} from "./queryTypes";
import type { AuthState, User, AuthResult, ConnectionStatus } from "./clientTypes";
import type {
  InstantQuery,
  InstantQueryResult,
  InstantSchema,
  InstantEntity,
  InstantSchemaDatabase,
} from "./helperTypes";
import type {
  AttrsDefs,
  CardinalityKind,
  DataAttrDef,
  EntitiesDef,
  EntitiesWithLinks,
  EntityDef,
  RoomsDef,
  InstantSchemaDef,
  InstantGraph,
  LinkAttrDef,
  LinkDef,
  LinksDef,
  PresenceOf,
  ResolveAttrs,
  RoomsOf,
  TopicsOf,
  ValueTypes,
  InstantUnknownSchema,
  BackwardsCompatibleSchema,
  UpdateParams,
  LinkParams,
} from "./schemaTypes";

const defaultOpenDevtool = true;

// types

export type Config = {
  appId: string;
  websocketURI?: string;
  apiURI?: string;
  devtool?: boolean;
};

export type InstantConfig<S extends InstantSchemaDef<any, any, any>> = {
  appId: string;
  websocketURI?: string;
  apiURI?: string;
  devtool?: boolean;
  schema?: S;
};

export type ConfigWithSchema<S extends InstantGraph<any, any>> = Config & {
  schema: S;
};

export type TransactionResult = {
  status: "synced" | "enqueued";
  clientId: string;
};

export type PublishTopic<TopicsByKey> = <Key extends keyof TopicsByKey>(
  topic: Key,
  data: TopicsByKey[Key],
) => void;

export type SubscribeTopic<PresenceShape, TopicsByKey> = <
  Key extends keyof TopicsByKey,
>(
  topic: Key,
  onEvent: (event: TopicsByKey[Key], peer: PresenceShape) => void,
) => () => void;

export type GetPresence<PresenceShape> = <Keys extends keyof PresenceShape>(
  opts: PresenceOpts<PresenceShape, Keys>,
) => PresenceResponse<PresenceShape, Keys>;

export type SubscribePresence<PresenceShape> = <
  Keys extends keyof PresenceShape,
>(
  opts: PresenceOpts<PresenceShape, Keys>,
  onChange: (slice: PresenceResponse<PresenceShape, Keys>) => void,
) => () => void;

export type RoomHandle<PresenceShape, TopicsByKey> = {
  leaveRoom: () => void;
  publishTopic: PublishTopic<TopicsByKey>;
  subscribeTopic: SubscribeTopic<PresenceShape, TopicsByKey>;
  publishPresence: (data: Partial<PresenceShape>) => void;
  getPresence: GetPresence<PresenceShape>;
  subscribePresence: SubscribePresence<PresenceShape>;
};

type AuthToken = string;

type SubscriptionState<Q, Schema, WithCardinalityInference extends boolean> =
  | { error: { message: string }; data: undefined; pageInfo: undefined }
  | {
      error: undefined;
      data: QueryResponse<Q, Schema, WithCardinalityInference>;
      pageInfo: PageInfoResponse<Q>;
    };

type InstaQLSubscriptionState<Schema, Q> =
  | { error: { message: string }; data: undefined; pageInfo: undefined }
  | {
      error: undefined;
      data: InstaQLResponse<Schema, Q>;
      pageInfo: PageInfoResponse<Q>;
    };

type LifecycleSubscriptionState<
  Q,
  Schema,
  WithCardinalityInference extends boolean,
> = SubscriptionState<Q, Schema, WithCardinalityInference> & {
  isLoading: boolean;
};

type InstaQLLifecycleState<Schema, Q> = InstaQLSubscriptionState<Schema, Q> & {
  isLoading: boolean;
};

type UnsubscribeFn = () => void;

// consts

const defaultConfig = {
  apiURI: "https://api.instantdb.com",
  websocketURI: "wss://api.instantdb.com/runtime/session",
};

// hmr
function initGlobalInstantCoreStore(): Record<string, any> {
  globalThis.__instantDbStore = globalThis.__instantDbStore ?? {};
  return globalThis.__instantDbStore;
}

const globalInstantCoreStore = initGlobalInstantCoreStore();

/**
 * Functions to log users in and out.
 *
 * @see https://instantdb.com/docs/auth
 */
class Auth {
  constructor(private db: Reactor) {}

  /**
   * Sends a magic code to the user's email address.
   *
   * Once you send the magic code, see {@link auth.signInWithMagicCode} to let the
   * user verify.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *  db.auth.sendMagicCode({email: "example@gmail.com"})
   *    .catch((err) => console.error(err.body?.message))
   */
  sendMagicCode = (params: { email: string }) => {
    return this.db.sendMagicCode(params);
  };
  /**
   * Verify a magic code that was sent to the user's email address.
   *
   * @see https://instantdb.com/docs/auth
   *
   * @example
   *  db.auth.signInWithMagicCode({email: "example@gmail.com", code: "123456"})
   *       .catch((err) => console.error(err.body?.message))
   */
  signInWithMagicCode = (params: { email: string; code: string }) => {
    return this.db.signInWithMagicCode(params);
  };

  /**
   * Sign in a user with a refresh token
   *
   * @see https://instantdb.com/docs/backend#frontend-auth-sign-in-with-token
   *
   * @example
   *   // Get the token from your backend
   *   const token = await fetch('/signin', ...);
   *   //Sign in
   *   db.auth.signInWithToken(token);
   */
  signInWithToken = (token: AuthToken) => {
    return this.db.signInWithCustomToken(token);
  };

  /**
   * Create an authorization url to sign in with an external provider
   *
   * @see https://instantdb.com/docs/auth
   *
   * @example
   *   // Get the authorization url from your backend
   *   const url = db.auth.createAuthorizationUrl({
   *     clientName: "google",
   *     redirectURL: window.location.href,
   *   });
   *
   *   // Put it in a sign in link
   *   <a href={url}>Log in with Google</a>
   */
  createAuthorizationURL = (params: { clientName: string; redirectURL }) => {
    return this.db.createAuthorizationURL(params);
  };

  /**
   * Sign in with the id_token from an external provider like Google
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *   db.auth
   *  .signInWithIdToken({
   *    // Token from external service
   *    idToken: id_token,
   *    // The name you gave the client when you registered it with Instant
   *    clientName: "google",
   *    // The nonce, if any, that you used when you initiated the auth flow
   *    // with the external service.
   *    nonce: your_nonce
   *  })
   *  .catch((err) => console.error(err.body?.message));
   *
   */
  signInWithIdToken = (params: {
    idToken: string;
    clientName: string;
    nonce?: string | undefined | null;
  }) => {
    return this.db.signInWithIdToken(params);
  };

  /**
   * Sign in with the id_token from an external provider like Google
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *   db.auth
   *  .exchangeOAuthCode({
   *    // code received in redirect from OAuth callback
   *    code: code
   *    // The PKCE code_verifier, if any, that you used when you
   *    // initiated the auth flow
   *    codeVerifier: your_code_verifier
   *  })
   *  .catch((err) => console.error(err.body?.message));
   *
   */
  exchangeOAuthCode = (params: {
    code: string;
    codeVerifier: string | undefined | null;
  }) => {
    return this.db.exchangeCodeForToken(params);
  };

  /**
   * OpenID Discovery path for use with tools like
   * expo-auth-session that use auto-discovery of
   * OAuth parameters.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *   const discovery = useAutoDiscovery(
   *     db.auth.issuerURI()
   *   );
   */
  issuerURI = () => {
    return this.db.issuerURI();
  };

  /**
   * Sign out the current user
   */
  signOut = () => {
    return this.db.signOut();
  };
}

/**
 * Functions to manage file storage.
 */
class Storage {
  constructor(private db: Reactor) {}

  /**
   * Uploads file at the provided path.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const [file] = e.target.files; // result of file input
   *   const isSuccess = await db.storage.upload('photos/demo.png', file);
   */
  upload = (pathname: string, file: File) => {
    return this.db.upload(pathname, file);
  };

  /**
   * @deprecated Use `db.storage.upload` instead
   */
  put = this.upload;

  /**
   * Retrieves a download URL for the provided path.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const url = await db.storage.getDownloadUrl('photos/demo.png');
   */
  getDownloadUrl = (pathname: string) => {
    return this.db.getDownloadUrl(pathname);
  };

  /**
   * Deletes a file by path name.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   await db.storage.delete('photos/demo.png');
   */
  delete = (pathname: string) => {
    return this.db.deleteFile(pathname);
  };
}

// util

function coerceQuery(o: any) {
  // stringify and parse to remove undefined values
  return JSON.parse(JSON.stringify(o));
}

class InstantCoreDatabase<Schema extends InstantSchemaDef<any, any, any>>
  implements IInstantDatabase<Schema>
{
  public _reactor: Reactor<RoomsOf<Schema>>;
  public auth: Auth;
  public storage: Storage;

  public tx = txInit<Schema>();

  constructor(reactor: Reactor<RoomsOf<Schema>>) {
    this._reactor = reactor;
    this.auth = new Auth(this._reactor);
    this.storage = new Storage(this._reactor);
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
  transact(
    chunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ): Promise<TransactionResult> {
    return this._reactor.pushTx(chunks);
  }

  getLocalId(name: string): Promise<string> {
    return this._reactor.getLocalId(name);
  }

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *  // listen to all goals
   *  db.subscribeQuery({ goals: {} }, (resp) => {
   *    console.log(resp.data.goals)
   *  })
   *
   *  // goals where the title is "Get Fit"
   *  db.subscribeQuery(
   *    { goals: { $: { where: { title: "Get Fit" } } } },
   *    (resp) => {
   *      console.log(resp.data.goals)
   *    }
   *  )
   *
   *  // all goals, _alongside_ their todos
   *  db.subscribeQuery({ goals: { todos: {} } }, (resp) => {
   *    console.log(resp.data.goals)
   *  });
   */
  subscribeQuery<Q extends InstaQLParams<Schema>>(
    query: Q,
    cb: (resp: InstaQLSubscriptionState<Schema, Q>) => void,
  ) {
    return this._reactor.subscribeQuery(query, cb);
  }

  /**
   * Listen for the logged in state. This is useful
   * for deciding when to show a login screen.
   *
   * @see https://instantdb.com/docs/auth
   * @example
   *   const unsub = db.subscribeAuth((auth) => {
   *     if (auth.user) {
   *     console.log('logged in as', auth.user.email)
   *    } else {
   *      console.log('logged out')
   *    }
   *  })
   */
  subscribeAuth(cb: (auth: AuthResult) => void): UnsubscribeFn {
    return this._reactor.subscribeAuth(cb);
  }

  /**
   * Listen for connection status changes to Instant. This is useful
   * for building things like connectivity indicators
   *
   * @see https://www.instantdb.com/docs/patterns#connection-status
   * @example
   *   const unsub = db.subscribeConnectionStatus((status) => {
   *     const connectionState =
   *       status === 'connecting' || status === 'opened'
   *         ? 'authenticating'
   *       : status === 'authenticated'
   *         ? 'connected'
   *       : status === 'closed'
   *         ? 'closed'
   *       : status === 'errored'
   *         ? 'errored'
   *       : 'unexpected state';
   *
   *     console.log('Connection status:', connectionState);
   *   });
   */
  subscribeConnectionStatus(cb: (status: ConnectionStatus) => void): UnsubscribeFn {
    return this._reactor.subscribeConnectionStatus(cb);
  }

  /**
   * Join a room to publish and subscribe to topics and presence.
   *
   * @see https://instantdb.com/docs/presence-and-topics
   * @example
   * // init
   * const db = init();
   * const room = db.joinRoom(roomType, roomId);
   * // usage
   * const unsubscribeTopic = room.subscribeTopic("foo", console.log);
   * const unsubscribePresence = room.subscribePresence({}, console.log);
   * room.publishTopic("hello", { message: "hello world!" });
   * room.publishPresence({ name: "joe" });
   * // later
   * unsubscribePresence();
   * unsubscribeTopic();
   * room.leaveRoom();
   */
  joinRoom<RoomType extends keyof RoomsOf<Schema>>(
    roomType: RoomType = "_defaultRoomType" as RoomType,
    roomId: string = "_defaultRoomId",
  ): RoomHandle<PresenceOf<Schema, RoomType>, TopicsOf<Schema, RoomType>> {
    const leaveRoom = this._reactor.joinRoom(roomId);

    return {
      leaveRoom,
      subscribeTopic: (topic, onEvent) =>
        this._reactor.subscribeTopic(roomId, topic, onEvent),
      subscribePresence: (opts, onChange) =>
        this._reactor.subscribePresence(roomType, roomId, opts, onChange),
      publishTopic: (topic, data) =>
        this._reactor.publishTopic({ roomType, roomId, topic, data }),
      publishPresence: (data) =>
        this._reactor.publishPresence(roomType, roomId, data),
      getPresence: (opts) => this._reactor.getPresence(roomType, roomId, opts),
    };
  }

  shutdown() {
    delete globalInstantCoreStore[this._reactor.config.appId];
    this._reactor.shutdown();
  }

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
  queryOnce<Q extends InstaQLParams<Schema>>(
    query: Q,
  ): Promise<{
    data: InstaQLResponse<Schema, Q>;
    pageInfo: PageInfoResponse<Q>;
  }> {
    return this._reactor.queryOnce(query);
  }
}

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/core"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/core"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({ appId: "my-app-id", schema })
 *  
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
>(
  config: InstantConfig<Schema>,
  Storage?: any,
  NetworkListener?: any,
  versions?: { [key: string]: string },
): InstantCoreDatabase<Schema> {
  const existingClient = globalInstantCoreStore[
    config.appId
  ] as InstantCoreDatabase<any>;

  if (existingClient) {
    return existingClient;
  }

  const reactor = new Reactor<RoomsOf<Schema>>(
    {
      ...defaultConfig,
      ...config,
      cardinalityInference: config.schema ? true : false,
    },
    Storage || IndexedDBStorage,
    NetworkListener || WindowNetworkListener,
    { ...(versions || {}), "@instantdb/core": version },
  );

  const client = new InstantCoreDatabase<any>(reactor);
  globalInstantCoreStore[config.appId] = client;

  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    const showDevtool =
      // show widget by default?
      ("devtool" in config ? Boolean(config.devtool) : defaultOpenDevtool) &&
      // only run on localhost (dev env)
      window.location.hostname === "localhost" &&
      // used by dash and other internal consumers
      !Boolean((globalThis as any)._nodevtool);

    if (showDevtool) {
      createDevtool(config.appId);
    }
  }

  return client;
}

type InstantRules = {
  [EntityName: string]: {
    allow: {
      view?: string;
      create?: string;
      update?: string;
      delete?: string;
      $default?: string;
    };
    bind?: string[];
  };
};

/**
 * @deprecated
 * `init_experimental` is deprecated. You can replace it with `init`.
 * 
 * @example
 *
 * // Before
 * import { init_experimental } from "@instantdb/core"
 * const db = init_experimental({  ...  });
 *
 * // After
 * import { init } from "@instantdb/core"
 * const db = init({ ...  });
 */
const init_experimental = init;

export {
  // bada bing bada boom
  init,
  init_experimental,
  id,
  tx,
  txInit,
  lookup,

  // cli
  i,

  // util
  getOps,
  coerceQuery,
  weakHash,
  IndexedDBStorage,
  WindowNetworkListener,
  InstantCoreDatabase,
  Auth,
  Storage,
  version,

  // og types
  type IDatabase,
  type RoomSchemaShape,
  type Query,
  type QueryResponse,
  type InstaQLResponse,
  type PageInfoResponse,
  type InstantObject,
  type Exactly,
  type TransactionChunk,
  type AuthState,
  type ConnectionStatus,
  type User,
  type AuthToken,
  type TxChunk,
  type SubscriptionState,
  type InstaQLSubscriptionState,
  type LifecycleSubscriptionState,
  type InstaQLLifecycleState,

  // presence types
  type PresenceOpts,
  type PresenceSlice,
  type PresenceResponse,

  // new query types
  type InstaQLParams,
  type InstaQLQueryParams,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantEntity,
  type InstantSchemaDatabase,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type RoomsDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type RoomsOf,
  type PresenceOf,
  type TopicsOf,
  type InstaQLEntity,
  type InstaQLResult,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type IInstantDatabase,
  type BackwardsCompatibleSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
};
