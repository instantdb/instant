import Reactor from './Reactor.js';
import {
  tx,
  txInit,
  lookup,
  getOps,
  type TxChunk,
  type TransactionChunk,
} from './instatx.js';
import weakHash from './utils/weakHash.js';
import id from './utils/id.ts';
import IndexedDBStorage from './IndexedDBStorage.ts';
import { coerceToDate } from './utils/dates.js';
import WindowNetworkListener from './WindowNetworkListener.js';
import { i } from './schema.js';
import { createDevtool } from './devtool.js';
import version from './version.ts';
import { validateQuery, QueryValidationError } from './queryValidation.ts';
import {
  validateTransactions,
  TransactionValidationError,
} from './transactionValidation.ts';

import {
  StorageInterface,
  type StorageInterfaceStoreName,
} from './utils/PersistedObject.ts';
import { createInstantRouteHandler } from './createRouteHandler.ts';
import { parseSchemaFromJSON } from './parseSchemaFromJSON.ts';

import type {
  PresenceOpts,
  PresenceResponse,
  PresenceSlice,
  RoomSchemaShape,
} from './presence.ts';
import type {
  DevtoolConfig,
  IDatabase,
  IInstantDatabase,
  StrictDevtoolConfig,
} from './coreTypes.ts';
import type {
  Query,
  QueryResponse,
  InstaQLResponse,
  PageInfoResponse,
  Exactly,
  InstantObject,
  InstaQLParams,
  InstaQLOptions,
  InstaQLQueryParams,
  InstaQLEntity,
  InstaQLEntitySubquery,
  InstaQLResult,
  InstaQLFields,
  ValidQuery,
} from './queryTypes.ts';
import type { PresencePeer } from './presenceTypes.ts';
import type {
  AuthState,
  User,
  AuthResult,
  ConnectionStatus,
} from './clientTypes.ts';
import type {
  InstantQuery,
  InstantQueryResult,
  InstantSchema,
  InstantEntity,
  InstantSchemaDatabase,
} from './helperTypes.ts';
import type {
  InstantDBAttr,
  InstantDBAttrOnDelete,
  InstantDBCheckedDataType,
  InstantDBIdent,
  InstantDBInferredType,
} from './attrTypes.ts';
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
  TopicOf,
  ValueTypes,
  InstantUnknownSchema,
  InstantUnknownSchemaDef,
  BackwardsCompatibleSchema,
  UpdateParams,
  LinkParams,
  CreateParams,
  RuleParams,
} from './schemaTypes.ts';
import type { InstantRules } from './rulesTypes.ts';
import type { UploadFileResponse, DeleteFileResponse } from './StorageAPI.ts';
import { FrameworkClient, type FrameworkConfig } from './framework.ts';

import type {
  ExchangeCodeForTokenParams,
  SendMagicCodeParams,
  SendMagicCodeResponse,
  SignInWithIdTokenParams,
  VerifyMagicCodeParams,
  VerifyResponse,
} from './authAPI.ts';

import { InstantAPIError, type InstantIssue } from './utils/fetch.js';
import { InstantError } from './InstantError.ts';
import { EventSourceType } from './Connection.ts';
import { CallbackEventType as SyncTableCallbackEventType } from './SyncTable.ts';
import type {
  SyncTableCallback,
  CallbackEvent as SyncTableCallbackEvent,
  InitialSyncBatch as SyncTableInitialSyncBatch,
  InitialSyncComplete as SyncTableInitialSyncComplete,
  SyncTransaction as SyncTableSyncTransaction,
  LoadFromStorage as SyncTableLoadFromStorage,
  SetupError as SyncTableSetupError,
} from './SyncTable.ts';

const defaultOpenDevtool = true;

// types

type ExactlyOne<T> = {
  [K in keyof T]: Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

export type Config = {
  appId: string;
  websocketURI?: string;
  apiURI?: string;
  devtool?: boolean | DevtoolConfig;
  verbose?: boolean;
  queryCacheLimit?: number;
  useDateObjects: boolean;
  disableValidation?: boolean;
};

export type InstantConfig<
  S extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
> = {
  appId: string;
  schema?: S;
  websocketURI?: string;
  firstPartyPath?: string;
  apiURI?: string;
  devtool?: boolean | DevtoolConfig;
  verbose?: boolean;
  queryCacheLimit?: number;
  useDateObjects: UseDates;
  disableValidation?: boolean;
};

export type ConfigWithSchema<S extends InstantGraph<any, any>> = Config & {
  schema: S;
};

export type TransactionResult = {
  status: 'synced' | 'enqueued';
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
) => PresenceResponse<PresenceShape, Keys> | null;

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

type InstaQLSubscriptionState<Schema, Q, UseDates extends boolean> =
  | { error: { message: string }; data: undefined; pageInfo: undefined }
  | {
      error: undefined;
      data: InstaQLResponse<Schema, Q, UseDates>;
      pageInfo: PageInfoResponse<Q>;
    };

type LifecycleSubscriptionState<
  Q,
  Schema,
  WithCardinalityInference extends boolean,
> = SubscriptionState<Q, Schema, WithCardinalityInference> & {
  isLoading: boolean;
};

type InstaQLLifecycleState<Schema, Q, UseDates extends boolean = false> =
  | (InstaQLSubscriptionState<Schema, Q, UseDates> & {
      isLoading: boolean;
    })
  | {
      isLoading: true;
      data: undefined;
      pageInfo: undefined;
      error: undefined;
    };

type UnsubscribeFn = () => void;

// consts

const defaultConfig = {
  apiURI: 'https://api.instantdb.com',
  websocketURI: 'wss://api.instantdb.com/runtime/session',
};

// hmr
function initSchemaHashStore(): WeakMap<any, string> {
  globalThis.__instantDbSchemaHashStore =
    globalThis.__instantDbSchemaHashStore ?? new WeakMap<any, string>();
  return globalThis.__instantDbSchemaHashStore;
}

function initGlobalInstantCoreStore(): Record<string, any> {
  globalThis.__instantDbStore = globalThis.__instantDbStore ?? {};
  return globalThis.__instantDbStore;
}

function reactorKey(config: InstantConfig<any, boolean>): string {
  // @ts-expect-error
  const adminToken = config.__adminToken;
  return (
    config.appId +
    '_' +
    (config.websocketURI || 'default_ws_uri') +
    '_' +
    (config.apiURI || 'default_api_uri') +
    '_' +
    (adminToken || 'client_only') +
    '_' +
    config.useDateObjects
  );
}

const globalInstantCoreStore = initGlobalInstantCoreStore();
const schemaHashStore = initSchemaHashStore();

type SignoutOpts = {
  invalidateToken?: boolean;
};

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
  sendMagicCode = (
    params: SendMagicCodeParams,
  ): Promise<SendMagicCodeResponse> => {
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
  signInWithMagicCode = (
    params: VerifyMagicCodeParams,
  ): Promise<VerifyResponse> => {
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
  signInWithToken = (token: AuthToken): Promise<VerifyResponse> => {
    return this.db.signInWithCustomToken(token);
  };

  /**
   * Sign in as guest, creating a new user without email
   *
   * @see https://instantdb.com/docs/auth
   *
   * @example
   *   db.auth.signInAsGuest();
   */
  signInAsGuest = (): Promise<VerifyResponse> => {
    return this.db.signInAsGuest();
  };

  /**
   * Create an authorization url to sign in with an external provider.
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
  createAuthorizationURL = (params: {
    clientName: string;
    redirectURL: string;
  }): string => {
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
  signInWithIdToken = (
    params: SignInWithIdTokenParams,
  ): Promise<VerifyResponse> => {
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
  exchangeOAuthCode = (params: ExchangeCodeForTokenParams) => {
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
  issuerURI = (): string => {
    return this.db.issuerURI();
  };

  /**
   * Sign out the current user
   */
  signOut = (opts: SignoutOpts = { invalidateToken: true }): Promise<void> => {
    return this.db.signOut(opts);
  };
}

type FileOpts = {
  contentType?: string;
  contentDisposition?: string;
  fileSize?: number; // Required for streaming uploads
};

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
   *   const data = await db.storage.uploadFile('photos/demo.png', file);
   */
  uploadFile = (
    path: string,
    file: File | Blob,
    opts: FileOpts = {},
  ): Promise<UploadFileResponse> => {
    return this.db.uploadFile(path, file, opts);
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

  // Deprecated Storage API (Jan 2025)
  // ---------------------------------

  /**
   * @deprecated. Use `db.storage.uploadFile` instead
   * remove in the future.
   */
  upload = (pathname: string, file: File) => {
    return this.db.upload(pathname, file);
  };

  /**
   * @deprecated Use `db.storage.uploadFile` instead
   */
  put = this.upload;

  /**
   * @deprecated. getDownloadUrl will be removed in the future.
   * Use `useQuery` instead to query and fetch for valid urls
   *
   * db.useQuery({
   *   $files: {
   *     $: {
   *       where: {
   *         path: "moop.png"
   *       }
   *     }
   *   }
   * })
   */
  getDownloadUrl = (pathname: string) => {
    return this.db.getDownloadUrl(pathname);
  };
}

// util

function coerceQuery(o: any) {
  // stringify and parse to remove undefined values
  return JSON.parse(JSON.stringify(o));
}

class InstantCoreDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
> implements IInstantDatabase<Schema>
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
  subscribeQuery<
    Q extends ValidQuery<Q, Schema>,
    UseDatesLocal extends boolean = UseDates,
  >(
    query: Q,
    cb: (resp: InstaQLSubscriptionState<Schema, Q, UseDatesLocal>) => void,
    opts?: InstaQLOptions,
  ) {
    return this._reactor.subscribeQuery(query, cb, opts);
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
    return this._reactor.getAuth();
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
  subscribeConnectionStatus(
    cb: (status: ConnectionStatus) => void,
  ): UnsubscribeFn {
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
    roomType: RoomType = '_defaultRoomType' as RoomType,
    roomId: string = '_defaultRoomId',
    opts?: {
      initialPresence?: Partial<PresenceOf<Schema, RoomType>>;
    },
  ): RoomHandle<PresenceOf<Schema, RoomType>, TopicsOf<Schema, RoomType>> {
    const leaveRoom = this._reactor.joinRoom(roomId, opts?.initialPresence);

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
    delete globalInstantCoreStore[reactorKey(this._reactor.config)];
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
  queryOnce<Q extends ValidQuery<Q, Schema>>(
    query: Q,
    opts?: InstaQLOptions,
  ): Promise<{
    data: InstaQLResponse<Schema, Q, UseDates>;
    pageInfo: PageInfoResponse<Q>;
  }> {
    return this._reactor.queryOnce(query, opts);
  }

  /**
   * @deprecated This is an experimental function that is not yet ready for production use.
   * Use this function to sync an entire namespace.
   * It has many limitations that will be removed in the future:
   * 1. Must be used with an admin token
   * 2. Does not support permissions
   * 3. Does not support where clauses
   * 4. Does not support links
   * It also does not support multiple top-level namespaces. For example,
   *  {posts: {}, users: {}} is invalid. Only `posts` or `users` is allowed, but not both.
   */
  _syncTableExperimental<Q extends ValidQuery<Q, Schema>>(
    query: ExactlyOne<Q>,
    cb: SyncTableCallback<Schema, Q, UseDates>,
  ): (
    opts?: { keepSubscription: boolean | null | undefined } | null | undefined,
  ) => void {
    return this._reactor.subscribeTable(query, cb);
  }
}

function schemaHash(schema?: InstantSchemaDef<any, any, any>): string {
  if (!schema) {
    return '0';
  }

  const fromStore = schemaHashStore.get(schema);
  if (fromStore) {
    return fromStore;
  }
  const hash = weakHash(schema);
  schemaHashStore.set(schema, hash);
  return hash;
}

function schemaChanged(
  existingClient: InstantCoreDatabase<any, boolean>,
  newSchema?: InstantSchemaDef<any, any, any>,
): boolean {
  return (
    schemaHash(existingClient._reactor.config.schema) !== schemaHash(newSchema)
  );
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
  UseDates extends boolean = false,
>(
  // Allows config with missing `useDateObjects`, but keeps `UseDates`
  // as a non-nullable in the InstantConfig type.
  config: Omit<InstantConfig<Schema, UseDates>, 'useDateObjects'> & {
    useDateObjects?: UseDates;
  },
  Storage?: any,
  NetworkListener?: any,
  versions?: { [key: string]: string },
  EventSourceImpl?: any,
): InstantCoreDatabase<Schema, UseDates> {
  const configStrict = {
    ...config,
    appId: config.appId?.trim(),
    useDateObjects: (config.useDateObjects ?? false) as UseDates,
  };
  const existingClient = globalInstantCoreStore[
    reactorKey(configStrict)
  ] as InstantCoreDatabase<any, UseDates>;

  if (existingClient) {
    if (schemaChanged(existingClient, configStrict.schema)) {
      existingClient._reactor.updateSchema(configStrict.schema);
    }
    return existingClient;
  }

  const reactor = new Reactor<RoomsOf<Schema>>(
    {
      ...defaultConfig,
      ...configStrict,
      cardinalityInference: configStrict.schema ? true : false,
    },
    Storage || IndexedDBStorage,
    NetworkListener || WindowNetworkListener,
    { ...(versions || {}), '@instantdb/core': version },
    EventSourceImpl,
  );

  const client = new InstantCoreDatabase<any, UseDates>(reactor);
  globalInstantCoreStore[reactorKey(configStrict)] = client;

  handleDevtool(configStrict.appId, configStrict.devtool);

  return client;
}

function handleDevtool(
  appId: string,
  devtool: boolean | DevtoolConfig | null | undefined,
) {
  if (
    typeof window === 'undefined' ||
    typeof window.location === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return;
  }

  if (typeof devtool === 'boolean' && !devtool) {
    return;
  }

  const config: StrictDevtoolConfig = {
    position: 'bottom-right' as const,
    allowedHosts: ['localhost'],
    ...(typeof devtool === 'object' ? devtool : {}),
  };

  if (!config.allowedHosts.includes(window.location.hostname)) {
    return;
  }

  createDevtool(appId, config);
}

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
  validateQuery,
  QueryValidationError,
  validateTransactions,
  parseSchemaFromJSON,
  TransactionValidationError,
  FrameworkClient,

  // error
  InstantAPIError,

  // cli
  i,

  // util
  getOps,
  coerceQuery,
  weakHash,
  coerceToDate,
  IndexedDBStorage,
  WindowNetworkListener,
  InstantCoreDatabase,
  Auth,
  Storage,
  version,
  InstantError,

  // sync table enums
  SyncTableCallbackEventType,

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
  type PresencePeer,

  // new query types
  type InstaQLParams,
  type ValidQuery,
  type InstaQLOptions,
  type InstaQLQueryParams,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantEntity,
  type InstantSchemaDatabase,
  type InstaQLFields,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type InstantUnknownSchemaDef,
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
  type TopicOf,
  type InstaQLEntity,
  type InstaQLResult,
  type InstaQLEntitySubquery,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type IInstantDatabase,
  type BackwardsCompatibleSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
  type CreateParams,
  type RuleParams,

  // attr types
  type InstantDBAttr,
  type InstantDBAttrOnDelete,
  type InstantDBCheckedDataType,
  type InstantDBIdent,
  type InstantDBInferredType,

  // auth types
  type ExchangeCodeForTokenParams,
  type SendMagicCodeParams,
  type SendMagicCodeResponse,
  type SignInWithIdTokenParams,
  type VerifyMagicCodeParams,
  type VerifyResponse,

  // storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,

  // SSE
  type EventSourceType,
  type FrameworkConfig,

  // sync table types
  type SyncTableCallback,
  type SyncTableCallbackEvent,
  type SyncTableInitialSyncBatch,
  type SyncTableInitialSyncComplete,
  type SyncTableSyncTransaction,
  type SyncTableLoadFromStorage,
  type SyncTableSetupError,

  // error types
  type InstantIssue,

  // storage (e.g. indexeddb) interface
  StorageInterface,
  type StorageInterfaceStoreName,
  createInstantRouteHandler,
};
