import Reactor from "./Reactor";
import { tx, lookup, TransactionChunk, EmptyChunk, getOps } from "./instatx";
import weakHash from "./utils/weakHash";
import id from "./utils/uuid";
import IndexedDBStorage from "./IndexedDBStorage";
import WindowNetworkListener from "./WindowNetworkListener";
import {
  Query,
  QueryResponse,
  PageInfoResponse,
  Exactly,
  InstantObject,
} from "./queryTypes";
import { AuthState, User, AuthResult } from "./clientTypes";
import {
  PresenceOpts,
  PresenceResponse,
  PresenceSlice,
  RoomSchemaShape,
} from "./presence";
import * as i from "./schema";
import { createDevtool } from "./devtool";

const defaultOpenDevtool = true;

// types

export type Config = {
  appId: string;
  websocketURI?: string;
  apiURI?: string;
  devtool?: boolean;
};

export type TransactionResult = {
  status: "synced" | "enqueued";
  clientId: string;
};

export type RoomHandle<PresenceShape, TopicsByKey> = {
  leaveRoom: () => void;
  publishTopic: <Key extends keyof TopicsByKey>(
    topic: Key,
    data: TopicsByKey[Key],
  ) => void;
  subscribeTopic: <Key extends keyof TopicsByKey>(
    topic: Key,
    onEvent: (event: TopicsByKey[Key], peer: PresenceShape) => void,
  ) => () => void;
  publishPresence: (data: Partial<PresenceShape>) => void;
  getPresence: <Keys extends keyof PresenceShape>(
    opts: PresenceOpts<PresenceShape, Keys>,
  ) => PresenceResponse<PresenceShape, Keys>;
  subscribePresence: <Keys extends keyof PresenceShape>(
    opts: PresenceOpts<PresenceShape, Keys>,
    onChange: (slice: PresenceResponse<PresenceShape, Keys>) => void,
  ) => () => void;
};

type AuthToken = string;

type SubscriptionState<Q, Schema> =
  | { error: { message: string }; data: undefined; pageInfo: undefined }
  | {
      error: undefined;
      data: QueryResponse<Q, Schema>;
      pageInfo: PageInfoResponse<Q>;
    };

type LifecycleSubscriptionState<Q, Schema> = SubscriptionState<Q, Schema> & {
  isLoading: boolean;
};

type UnsubscribeFn = () => void;

// consts

const defaultConfig = {
  apiURI: "https://api.instantdb.com",
  websocketURI: "wss://api.instantdb.com/runtime/session",
};

// hmr

function initGlobalInstantCoreStore(): Record<string, InstantCore<any>> {
  if (typeof window !== "undefined") {
    // @ts-expect-error
    window.__instantDbStore = window.__instantDbStore ?? {};
    // @ts-expect-error
    return window.__instantDbStore;
  }

  return {};
}

const globalInstantCoreStore = initGlobalInstantCoreStore();

// main

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id" })
 *
 * // You can also provide a a schema for type safety and editor autocomplete!
 *
 *  type Schema = {
 *    goals: {
 *      title: string
 *    }
 *  }
 *
 *  const db = init<Schema>({ appId: "my-app-id" })
 *
 */
function init<Schema = {}, RoomSchema extends RoomSchemaShape = {}>(
  config: Config,
  Storage?: any,
  NetworkListener?: any,
): InstantCore<Schema, RoomSchema> {
  const existingClient = globalInstantCoreStore[config.appId] as InstantCore<
    Schema,
    RoomSchema
  >;

  if (existingClient) {
    return existingClient;
  }

  const reactor = new Reactor<RoomSchema>(
    {
      ...defaultConfig,
      ...config,
    },
    Storage || IndexedDBStorage,
    NetworkListener || WindowNetworkListener,
  );

  const client = new InstantCore<Schema, RoomSchema>(reactor);
  globalInstantCoreStore[config.appId] = client;

  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    const showDevtool =
      // show widget by deafult?
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

class InstantCore<Schema = {}, RoomSchema extends RoomSchemaShape = {}> {
  public _reactor: Reactor<RoomSchema>;
  public auth: Auth;
  public storage: Storage;

  constructor(reactor: Reactor<RoomSchema>) {
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
    chunks: TransactionChunk | TransactionChunk[],
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
  subscribeQuery<Q extends Query>(
    query: Exactly<Query, Q>,
    cb: (resp: SubscriptionState<Q, Schema>) => void,
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
  joinRoom<RoomType extends keyof RoomSchema>(
    roomType: RoomType = "_defaultRoomType" as RoomType,
    roomId: string = "_defaultRoomId",
  ): RoomHandle<
    RoomSchema[RoomType]["presence"],
    RoomSchema[RoomType]["topics"]
  > {
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
}

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
   * Sign in a user with a refresh toke
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
    nonce: string | undefined | null;
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
    this.db.signOut();
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
   *   const isSuccess = await db.storage.put('photos/demo.png', file);
   */
  put = (pathname: string, file: File) => {
    return this.db.upload(pathname, file);
  };

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
}

// util

function coerceQuery(o: any) {
  // stringify and parse to remove undefined values
  return JSON.parse(JSON.stringify(o));
}

// dev

export {
  // bada bing bada boom
  init,
  id,
  tx,
  lookup,

  // cli
  i,

  // util
  getOps,
  coerceQuery,
  weakHash,
  IndexedDBStorage,
  WindowNetworkListener,
  InstantCore as InstantClient,
  Auth,
  Storage,

  // types
  RoomSchemaShape,
  Query,
  QueryResponse,
  InstantObject,
  Exactly,
  TransactionChunk,
  AuthState,
  User,
  AuthToken,
  EmptyChunk,
  SubscriptionState,
  LifecycleSubscriptionState,
  PresenceOpts,
  PresenceSlice,
  PresenceResponse,
};
