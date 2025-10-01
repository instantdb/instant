// @ts-check
import weakHash from './utils/weakHash.ts';
import * as instaml from './instaml.js';
import * as s from './store.js';
import uuid from './utils/uuid.ts';
import IndexedDBStorage from './IndexedDBStorage.js';
import WindowNetworkListener from './WindowNetworkListener.js';
import * as authAPI from './authAPI.ts';
import * as StorageApi from './StorageAPI.ts';
import * as flags from './utils/flags.ts';
import { Deferred } from './utils/Deferred.js';
import { PersistedObject } from './utils/PersistedObject.js';
import { areObjectsDeepEqual } from './utils/object.js';
import { createLinkIndex } from './utils/linkIndex.ts';
import version from './version.ts';
import createLogger from './utils/log.ts';
import { validateQuery } from './queryValidation.ts';
import { validateTransactions } from './transactionValidation.ts';
import { InstantError } from './InstantError.ts';
import { validate as validateUUID } from 'uuid';
import { QueryManager } from './reactor/queryManager.ts';
import { MutationManager } from './reactor/mutationManager.ts';
import { ConnectionManager } from './reactor/connectionManager.ts';
import { RoomManager } from './reactor/roomManager.ts';
/** @typedef {import('./utils/log.ts').Logger} Logger */

const STATUS = {
  CONNECTING: 'connecting',
  OPENED: 'opened',
  AUTHENTICATED: 'authenticated',
  CLOSED: 'closed',
  ERRORED: 'errored',
};

const QUERY_ONCE_TIMEOUT = 30_000;
const defaultConfig = {
  apiURI: 'https://api.instantdb.com',
  websocketURI: 'wss://api.instantdb.com/runtime/session',
};

// Param that the backend adds if this is an oauth redirect
const OAUTH_REDIRECT_PARAM = '_instant_oauth_redirect';

const currentUserKey = `currentUser`;

let _wsId = 0;
function createWebSocket(uri) {
  const ws = new WebSocket(uri);
  // @ts-ignore
  ws._id = _wsId++;
  return ws;
}

function isClient() {
  const hasWindow = typeof window !== 'undefined';
  // this checks if we are running in a chrome extension
  // @ts-expect-error
  const isChrome = typeof chrome !== 'undefined';

  return hasWindow || isChrome;
}

const ignoreLogging = {
  'set-presence': true,
  'set-presence-ok': true,
  'refresh-presence': true,
  'patch-presence': true,
};

/**
 * @template {import('./presence.ts').RoomSchemaShape} [RoomSchema = {}]
 */
export default class Reactor {
  attrs;
  _isOnline = true;
  _isShutdown = false;
  status = STATUS.CONNECTING;

  queries;
  mutations;
  connection;
  rooms;
  authCbs = [];
  attrsCbs = [];
  connectionStatusCbs = [];
  config;
  _persister;
  _localIdPromises = {};
  _errorMessage = null;
  /** @type {Promise<null | {error: {message: string}}>}**/
  _oauthCallbackResponse = null;

  /** @type {null | import('./utils/linkIndex.ts').LinkIndex}} */
  _linkIndex = null;

  /** @type BroadcastChannel | undefined */
  _broadcastChannel;

  _currentUserCached = { isLoading: true, error: undefined, user: undefined };
  _beforeUnloadCbs = [];
  /** @type {Logger} */
  _log;

  constructor(
    config,
    Storage = IndexedDBStorage,
    NetworkListener = WindowNetworkListener,
    versions,
  ) {
    this.config = { ...defaultConfig, ...config };
    this.queryCacheLimit = this.config.queryCacheLimit ?? 10;

    this._log = createLogger(
      config.verbose || flags.devBackend || flags.instantLogs,
    );

    this.versions = { ...(versions || {}), '@instantdb/core': version };

    this.mutations = new MutationManager({
      config: this.config,
      getAttrs: () => this.attrs,
      setAttrs: (attrs) => this._setAttrs(attrs),
      getQuerySubscriptions: () => this.querySubs?.currentValue || {},
      notifyQueriesUpdated: () => this.notifyAll(),
      notifyAttrsSubs: () => this.notifyAttrsSubs(),
      isOnline: () => this._isOnline,
      isAuthenticated: () => this.status === STATUS.AUTHENTICATED,
      send: (eventId, message) => this._send(eventId, message),
    });

    this.queries = new QueryManager({
      config: this.config,
      queryCacheLimit: this.queryCacheLimit,
      getError: () => this._errorMessage,
      getPendingMutations: () => this.pendingMutations,
      rewriteMutationsSorted: (attrs, muts, processedTxId) =>
        this.mutations.rewriteMutationsSorted(attrs, muts, processedTxId),
      applyOptimisticUpdates: (store, mutations, processedTxId) =>
        this.mutations.applyOptimisticUpdates(store, mutations, processedTxId),
      enableCardinalityInference: () => this._enableCardinalityInference(),
      getLinkIndex: () => this._linkIndex,
      getAttrs: () => this.attrs,
      sendAddQuery: (eventId, message) => this._sendAuthed(eventId, message),
      sendRemoveQuery: (eventId, message) =>
        this._sendAuthed(eventId, message),
      notifyQueriesChanged: () => this.loadedNotifyAll(),
    });

    this.connection = new ConnectionManager({
      createSocket: createWebSocket,
      websocketURI: this.config.websocketURI,
      appId: this.config.appId,
      log: this._log,
      isShutdown: () => this._isShutdown,
      isOnline: () => this._isOnline,
      setStatus: (status, err) => this._setStatus(status, err),
      getCurrentUser: () => this.getCurrentUser(),
      buildInitMessage: (refreshToken) => ({
        op: 'init',
        'app-id': this.config.appId,
        'refresh-token': refreshToken,
        versions: this.versions,
        '__admin-token': this.config.__adminToken,
      }),
      generateEventId: () => uuid(),
      shouldLog: (op) => !ignoreLogging[op],
      handleReceive: (wsId, msg) => this._handleReceive(wsId, msg),
      onSocketClosed: () => {
        this.rooms.handleSocketClosed();
      },
    });

    this.rooms = new RoomManager({
      sendAuthed: (eventId, message) => this._sendAuthed(eventId, message),
      generateEventId: () => uuid(),
    });

    if (this.config.schema) {
      this._linkIndex = createLinkIndex(this.config.schema);
    }

    // This is to protect us against running
    // server-side.
    if (!isClient()) {
      return;
    }

    if (!config.appId) {
      throw new Error('Instant must be initialized with an appId.');
    }

    if (!validateUUID(config.appId)) {
      throw new Error(
        `Instant must be initialized with a valid appId. \`${config.appId}\` is not a valid uuid.`,
      );
    }

    if (typeof BroadcastChannel === 'function') {
      this._broadcastChannel = new BroadcastChannel('@instantdb');
      this._broadcastChannel.addEventListener('message', async (e) => {
        try {
          if (e.data?.type === 'auth') {
            const res = await this.getCurrentUser();
            this.updateUser(res.user);
          }
        } catch (e) {
          this._log.error('[error] handle broadcast channel', e);
        }
      });
    }

    this._oauthCallbackResponse = this._oauthLoginInit();

    this._initStorage(Storage);

    // kick off a request to cache it
    this.getCurrentUser();

    NetworkListener.getIsOnline().then((isOnline) => {
      this._isOnline = isOnline;
      this.connection.start();
      NetworkListener.listen((isOnline) => {
        // We do this because react native's NetInfo
        // fires multiple online events.
        // We only want to handle one state change
        if (isOnline === this._isOnline) {
          return;
        }
        this._log.info('[network] online =', isOnline);
        this._isOnline = isOnline;
        if (this._isOnline) {
          this.connection.start();
        } else {
          this._log.info(
            'Changing status from',
            this.status,
            'to',
            STATUS.CLOSED,
          );
          this._setStatus(STATUS.CLOSED);
          this.rooms.handleSocketClosed();
        }
      });
    });

    if (typeof addEventListener !== 'undefined') {
      this._beforeUnload = this._beforeUnload.bind(this);
      addEventListener('beforeunload', this._beforeUnload);
    }
  }

  get querySubs() {
    return this.queries?.querySubs;
  }

  get queryRegistry() {
    return this.queries?.queryRegistry;
  }

  get pendingMutations() {
    return this.mutations?.pendingMutations;
  }

  updateSchema(schema) {
    this.config = {
      ...this.config,
      schema: schema,
      cardinalityInference: Boolean(schema),
    };
    this._linkIndex = schema ? createLinkIndex(this.config.schema) : null;
  }

  _initStorage(Storage) {
    this._persister = new Storage(`instant_${this.config.appId}_5`);
    this.queries.initStorage({ persister: this._persister });
    this.mutations.initStorage({ persister: this._persister });
    this._beforeUnloadCbs.push(() => {
      this.pendingMutations.flush();
      this.querySubs.flush();
    });
  }

  _beforeUnload() {
    for (const cb of this._beforeUnloadCbs) {
      cb();
    }
  }

  _setStatus(status, err) {
    this.status = status;
    this._errorMessage = err;
    this.notifyConnectionStatusSubs(status);
  }

  _enableCardinalityInference() {
    if (!this.config.schema) {
      return false;
    }
    if ('cardinalityInference' in this.config) {
      return Boolean(this.config.cardinalityInference);
    }
    return true;
  }

  _send(eventId, msg) {
    this.connection.send(eventId, msg);
  }

  _sendAuthed(eventId, msg) {
    if (this.status !== STATUS.AUTHENTICATED) {
      return;
    }
    this._send(eventId, msg);
  }

  _handleReceive(wsId, msg) {
    if (!ignoreLogging[msg.op]) {
      this._log.info('[receive]', wsId, msg.op, msg);
    }
    switch (msg.op) {
      case 'init-ok':
        this._setStatus(STATUS.AUTHENTICATED);
        this.connection.resetBackoff();
        this._setAttrs(msg.attrs);
        this._flushPendingMessages();
        this.rooms.setSessionId(msg['session-id']);
        this.rooms.resendJoins();
        break;
      case 'add-query-exists':
        this.notifyOneQueryOnce(weakHash(msg.q));
        break;
      case 'add-query-ok':
        this.queries.handleAddQueryOk(msg, {
          processedTxId: msg['processed-tx-id'],
        });
        this._cleanupPendingMutationsQueries();
        this._cleanupPendingMutationsTimeout();
        break;
      case 'refresh-ok':
        const { computations, attrs } = msg;
        const processedTxId = msg['processed-tx-id'];
        if (attrs) {
          this._setAttrs(attrs);
        }

        this._cleanupPendingMutationsTimeout();

        const rewrittenMutations = this.mutations.rewriteMutations(
          this.attrs,
          this.pendingMutations.currentValue,
          processedTxId,
        );

        if (rewrittenMutations !== this.pendingMutations.currentValue) {
          // We know we've changed the mutations to fix the attr ids and removed
          // processed attrs, so we'll persist those changes to prevent optimisticAttrs
          // from using old attr definitions
          this.pendingMutations.set(() => rewrittenMutations);
        }

        const mutations = this.mutations.rewriteMutationsSorted(
          this.attrs,
          this.pendingMutations.currentValue,
          processedTxId,
        );

        this.queries.handleRefreshOk(msg, mutations);
        this._cleanupPendingMutationsQueries();
        break;
      case 'transact-ok':
        const { 'client-event-id': eventId, 'tx-id': txId } = msg;
        this.mutations.handleTransactOk(eventId, txId);
        break;
      case 'patch-presence': {
        const roomId = msg['room-id'];
        this.rooms.handlePatchPresence(roomId, msg['edits']);
        break;
      }
      case 'refresh-presence': {
        const roomId = msg['room-id'];
        this.rooms.handleRefreshPresence(roomId, msg['data']);
        break;
      }
      case 'server-broadcast':
        const room = msg['room-id'];
        const topic = msg.topic;
        this.rooms.handleServerBroadcast(room, topic, msg);
        break;
      case 'join-room-ok':
        const loadingRoomId = msg['room-id'];
        this.rooms.handleJoinRoomOk(loadingRoomId);
        break;
      case 'join-room-error':
        const errorRoomId = msg['room-id'];
        this.rooms.handleJoinRoomError(errorRoomId, msg['error']);
        break;
      case 'error':
        this._handleReceiveError(msg);
        break;
      default:
        break;
    }
  }

  _handleReceiveError(msg) {
    console.log('error', msg);
    const eventId = msg['client-event-id'];
    const prevMutation = this.pendingMutations.currentValue.get(eventId);
    const errorMessage = {
      message: msg.message || 'Uh-oh, something went wrong. Ping Joe & Stopa.',
    };

    if (msg.hint) {
      errorMessage.hint = msg.hint;
    }

    if (prevMutation) {
      this.mutations.handleMutationError('error', eventId, msg);
      return;
    }

    if (
      msg['original-event']?.hasOwnProperty('q') &&
      msg['original-event']?.op === 'add-query'
    ) {
      const q = msg['original-event']?.q;
      const hash = weakHash(q);
      this.notifyQueryError(weakHash(q), errorMessage);
      this.notifyQueryOnceError(q, hash, eventId, errorMessage);
      return;
    }

    const isInitError = msg['original-event']?.op === 'init';
    if (isInitError) {
      if (
        msg.type === 'record-not-found' &&
        msg.hint?.['record-type'] === 'app-user'
      ) {
        // User has been logged out
        this.changeCurrentUser(null);
        return;
      }

      // We failed to init

      this._setStatus(STATUS.ERRORED, errorMessage);
      this.notifyAll();
      return;
    }
    // We've caught some error which has no corresponding listener.
    // Let's console.error to let the user know.
    const errorObj = { ...msg };
    delete errorObj.message;
    delete errorObj.hint;
    console.error(msg.message, errorObj);
    if (msg.hint) {
      console.error(
        'This error comes with some debugging information. Here it is: \n',
        msg.hint,
      );
    }
  }

  notifyQueryOnceError(q, hash, eventId, e) {
    this.queries.notifyQueryOnceError(q, hash, eventId, e);
  }

  _setAttrs(attrs) {
    this.attrs = attrs.reduce((acc, attr) => {
      acc[attr.id] = attr;
      return acc;
    }, {});

    this.notifyAttrsSubs();
  }

  // ---------------------------
  // Queries

  getPreviousResult = (q) => {
    return this.queries.getPreviousResult(q);
  };

  /**
   *  When a user subscribes to a query the following side effects occur:
   *
   *  - We update querySubs to include the new query
   *  - We update queryCbs to include the new cb
   *  - If we already have a result for the query we call cb immediately
   *  - We send the server an `add-query` message
   *
   *  Returns an unsubscribe function
   */
  subscribeQuery(q, cb, opts) {
    if (!this.config.disableValidation) {
      validateQuery(q, this.config.schema);
    }
    if (opts && 'ruleParams' in opts) {
      q = { $$ruleParams: opts['ruleParams'], ...q };
    }

    return this.queries.subscribeQuery(q, cb);
  }

  queryOnce(q, opts) {
    if (!this.config.disableValidation) {
      validateQuery(q, this.config.schema);
    }

    if (opts && 'ruleParams' in opts) {
      q = { $$ruleParams: opts['ruleParams'], ...q };
    }

    const dfd = new Deferred();

    if (!this._isOnline) {
      dfd.reject(
        new Error("We can't run `queryOnce`, because the device is offline."),
      );
      return dfd.promise;
    }

    if (!this.querySubs) {
      dfd.reject(
        new Error(
          "We can't run `queryOnce` on the backend. Use adminAPI.query instead: https://www.instantdb.com/docs/backend#query",
        ),
      );
      return dfd.promise;
    }

    const hash = weakHash(q);

    const eventId = this.queries.startQuerySub(q, hash);

    this.queries.queryOnce(q, dfd, eventId);

    setTimeout(
      () => dfd.reject(new Error('Query timed out')),
      QUERY_ONCE_TIMEOUT,
    );

    return dfd.promise;
  }

  async _completeQueryOnce(q, hash, dfd) {
    await this.queries.completeQueryOnce(q, hash, dfd);
  }

  async _unsubQuery(q, hash, cb) {
    await this.queries.unsubQuery(q, hash, cb);
  }

  // When we `pushTx`, it's possible that we don't yet have `this.attrs`
  // This means that `tx-steps` in `pendingMutations` will include `add-attr`
  // commands for attrs that already exist.
  //
  // This will also affect `add-triple` and `retract-triple` which
  // reference attr-ids that do not match the server.
  //
  // We fix this by rewriting `tx-steps` in each `pendingMutation`.
  // We remove `add-attr` commands for attrs that already exist.
  // We update `add-triple` and `retract-triple` commands to use the
  // server attr-ids.
  // ---------------------------
  // Transact

  optimisticAttrs() {
    return this.mutations.optimisticAttrs();
  }

  _rewriteMutations(attrs, muts, processedTxId) {
    return this.mutations.rewriteMutations(attrs, muts, processedTxId);
  }

  _rewriteMutationsSorted(attrs, muts, processedTxId) {
    return this.mutations.rewriteMutationsSorted(attrs, muts, processedTxId);
  }

  dataForQuery(hash) {
    return this.queries.dataForQuery(hash);
  }

  _applyOptimisticUpdates(store, mutations, processedTxId) {
    return this.mutations.applyOptimisticUpdates(
      store,
      mutations,
      processedTxId,
    );
  }

  /** Re-run instaql and call all callbacks with new data */
  notifyOne = (hash) => {
    this.queries.notifyOne(hash);
  };

  notifyOneQueryOnce = (hash) => {
    this.queries.notifyOneQueryOnce(hash);
  };

  notifyQueryError = (hash, error) => {
    this.queries.notifyQueryError(hash, error);
  };

  /** Re-compute all subscriptions */
  notifyAll() {
    this.queries.notifyAll();
  }

  loadedNotifyAll() {
    this.queries.loadedNotifyAll(this.pendingMutations);
  }

  /** Applies transactions locally and sends transact message to server */
  pushTx = (chunks) => {
    // Throws if transactions are invalid
    if (!this.config.disableValidation) {
      validateTransactions(chunks, this.config.schema);
    }
    try {
      const txSteps = instaml.transform(
        {
          attrs: this.optimisticAttrs(),
          schema: this.config.schema,
          stores: Object.values(this.querySubs.currentValue).map(
            (sub) => sub?.result?.store,
          ),
          useDateObjects: this.config.useDateObjects,
        },
        chunks,
      );
      return this.pushOps(txSteps);
    } catch (e) {
      return this.pushOps([], e);
    }
  };

  /**
   * @param {*} txSteps
   * @param {*} [error]
   * @returns
   */
  pushOps = (txSteps, error) => {
    return this.mutations.enqueueMutation(txSteps, error);
  };

  shutdown() {
    this._log.info('[shutdown]', this.config.appId);
    this._isShutdown = true;
    this.connection.shutdown();
  }

  // ---------------------------
  // Websocket

  /** Send messages we accumulated while we were connecting */
  _flushPendingMessages() {
    this.queries.flushPendingMessages((eventId, payload) => {
      this._sendAuthed(eventId, payload);
    });

    this.mutations.sendPendingMutations();
  }

  /**
   * Clean up pendingMutations that all queries have seen
   */
  _cleanupPendingMutationsQueries() {
    this.mutations.cleanupPendingMutationsQueries();
  }

  /**
   * After mutations is confirmed by server, we give each query 30 sec
   * to update its results. If that doesn't happen, we assume query is
   * unaffected by this mutation and it’s safe to delete it from local queue
   */
  _cleanupPendingMutationsTimeout() {
    this.mutations.cleanupPendingMutationsTimeout();
  }

  /**
   * Given a key, returns a stable local id, unique to this device and app.
   *
   * This can be useful if you want to create guest ids for example.
   *
   * Note: If the user deletes their local storage, this id will change.
   *
   * We use this._localIdPromises to ensure that we only generate a local
   * id once, even if multiple callers call this function concurrently.
   */
  async getLocalId(name) {
    const k = `localToken_${name}`;
    const id = await this._persister.getItem(k);
    if (id) return id;
    if (this._localIdPromises[k]) {
      return this._localIdPromises[k];
    }
    const newId = uuid();
    this._localIdPromises[k] = this._persister
      .setItem(k, newId)
      .then(() => newId);
    return this._localIdPromises[k];
  }

  // ----
  // Auth
  _replaceUrlAfterOAuth() {
    if (typeof URL === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get(OAUTH_REDIRECT_PARAM)) {
      const startUrl = url.toString();
      url.searchParams.delete(OAUTH_REDIRECT_PARAM);
      url.searchParams.delete('code');
      url.searchParams.delete('error');
      const newPath =
        url.pathname +
        (url.searchParams.size ? '?' + url.searchParams : '') +
        url.hash;
      // Note: In next.js, this will revert to the old state if user navigates
      //       back. We would need to allow framework specific routing to work
      //       around that problem.
      history.replaceState(history.state, '', newPath);

      // navigation is part of the HTML spec, but not supported by Safari
      // or Firefox yet:
      // https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API#browser_compatibility
      if (
        // @ts-ignore (waiting for ts support)
        typeof navigation === 'object' &&
        // @ts-ignore (waiting for ts support)
        typeof navigation.addEventListener === 'function' &&
        // @ts-ignore (waiting for ts support)
        typeof navigation.removeEventListener === 'function'
      ) {
        let ran = false;

        // The next.js app router will reset the URL when the router loads.
        // This puts it back after the router loads.
        const listener = (e) => {
          if (!ran) {
            ran = true;
            // @ts-ignore (waiting for ts support)
            navigation.removeEventListener('navigate', listener);
            if (
              !e.userInitiated &&
              e.navigationType === 'replace' &&
              e.destination?.url === startUrl
            ) {
              history.replaceState(history.state, '', newPath);
            }
          }
        };
        // @ts-ignore (waiting for ts support)
        navigation.addEventListener('navigate', listener);
      }
    }
  }

  /**
   *
   * @returns Promise<null | {error: {message: string}}>
   */
  async _oauthLoginInit() {
    if (
      typeof window === 'undefined' ||
      typeof window.location === 'undefined' ||
      typeof URLSearchParams === 'undefined'
    ) {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.get(OAUTH_REDIRECT_PARAM)) {
      return null;
    }

    const error = params.get('error');
    if (error) {
      this._replaceUrlAfterOAuth();
      return { error: { message: error } };
    }
    const code = params.get('code');
    if (!code) {
      return null;
    }
    this._replaceUrlAfterOAuth();
    try {
      const { user } = await authAPI.exchangeCodeForToken({
        apiURI: this.config.apiURI,
        appId: this.config.appId,
        code,
      });
      this.setCurrentUser(user);
      return null;
    } catch (e) {
      if (
        e?.body?.type === 'record-not-found' &&
        e?.body?.hint?.['record-type'] === 'app-oauth-code' &&
        (await this._hasCurrentUser())
      ) {
        // We probably just weren't able to clean up the URL, so
        // let's just ignore this error
        return null;
      }
      const message = e?.body?.message || 'Error logging in.';
      return { error: { message } };
    }
  }

  async _waitForOAuthCallbackResponse() {
    return await this._oauthCallbackResponse;
  }

  __subscribeMutationErrors(cb) {
    return this.mutations.subscribeMutationErrors(cb);
  }

  subscribeAuth(cb) {
    this.authCbs.push(cb);
    const currUserCached = this._currentUserCached;
    if (!currUserCached.isLoading) {
      cb(this._currentUserCached);
    }
    let unsubbed = false;
    this.getCurrentUser().then((resp) => {
      if (unsubbed) return;
      if (areObjectsDeepEqual(resp, currUserCached)) return;
      cb(resp);
    });
    return () => {
      unsubbed = true;
      this.authCbs = this.authCbs.filter((x) => x !== cb);
    };
  }

  async getAuth() {
    const { user, error } = await this.getCurrentUser();
    if (error) {
      throw new InstantError('Could not get current user: ' + error.message);
    }
    return user;
  }

  subscribeConnectionStatus(cb) {
    this.connectionStatusCbs.push(cb);

    return () => {
      this.connectionStatusCbs = this.connectionStatusCbs.filter(
        (x) => x !== cb,
      );
    };
  }

  subscribeAttrs(cb) {
    this.attrsCbs.push(cb);

    if (this.attrs) {
      cb(this.attrs);
    }

    return () => {
      this.attrsCbs = this.attrsCbs.filter((x) => x !== cb);
    };
  }

  notifyAuthSubs(user) {
    this.authCbs.forEach((cb) => cb(user));
  }

  notifyAttrsSubs() {
    if (!this.attrs) return;
    const oas = this.optimisticAttrs();
    this.attrsCbs.forEach((cb) => cb(oas));
  }

  notifyConnectionStatusSubs(status) {
    this.connectionStatusCbs.forEach((cb) => cb(status));
  }

  async setCurrentUser(user) {
    await this._persister.setItem(currentUserKey, JSON.stringify(user));
  }

  getCurrentUserCached() {
    return this._currentUserCached;
  }

  async getCurrentUser() {
    const oauthResp = await this._waitForOAuthCallbackResponse();
    if (oauthResp?.error) {
      const errorV = { error: oauthResp.error, user: undefined };
      this._currentUserCached = { isLoading: false, ...errorV };
      return errorV;
    }
    const user = await this._persister.getItem(currentUserKey);
    const userV = { user: JSON.parse(user), error: undefined };
    this._currentUserCached = {
      isLoading: false,
      ...userV,
    };
    return userV;
  }

  async _hasCurrentUser() {
    const user = await this._persister.getItem(currentUserKey);
    return JSON.parse(user) != null;
  }

  async changeCurrentUser(newUser) {
    const { user: oldUser } = await this.getCurrentUser();
    if (areObjectsDeepEqual(oldUser, newUser)) {
      // We were already logged in as the newUser, don't
      // bother updating
      return;
    }
    await this.setCurrentUser(newUser);
    // We need to remove all `result` from querySubs,
    // as they are no longer valid for the new user
    this.updateUser(newUser);

    try {
      this._broadcastChannel?.postMessage({ type: 'auth' });
    } catch (error) {
      console.error('Error posting message to broadcast channel', error);
    }
  }

  updateUser(newUser) {
    const newV = { error: undefined, user: newUser };
    this._currentUserCached = { isLoading: false, ...newV };
    this.queries.clearCache();
    this.querySubs.set((prev) => {
      Object.keys(prev).forEach((k) => {
        delete prev[k].result;
      });
      return prev;
    });
    this.connection.resetBackoff();
    this.connection.close();
    this.rooms.setSessionId(null);
    this._oauthCallbackResponse = null;
    this.notifyAuthSubs(newV);
  }

  sendMagicCode({ email }) {
    return authAPI.sendMagicCode({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      email: email,
    });
  }

  async signInWithMagicCode({ email, code }) {
    const currentUser = await this.getCurrentUser();
    const isGuest = currentUser?.user?.type === 'guest';
    const res = await authAPI.verifyMagicCode({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      email,
      code,
      refreshToken: isGuest ? currentUser.user.refresh_token : undefined,
    });
    await this.changeCurrentUser(res.user);
    return res;
  }

  async signInWithCustomToken(authToken) {
    const res = await authAPI.verifyRefreshToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      refreshToken: authToken,
    });
    await this.changeCurrentUser(res.user);
    return res;
  }

  async signInAsGuest() {
    const res = await authAPI.signInAsGuest({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
    });
    await this.changeCurrentUser(res.user);
    return res;
  }

  potentiallyInvalidateToken(currentUser, opts) {
    const refreshToken = currentUser?.user?.refresh_token;
    if (!refreshToken) {
      return;
    }
    const wantsToSkip = opts.invalidateToken === false;
    if (wantsToSkip) {
      this._log.info('[auth-invalidate] skipped invalidateToken');
      return;
    }
    authAPI
      .signOut({
        apiURI: this.config.apiURI,
        appId: this.config.appId,
        refreshToken,
      })
      .then(() => {
        this._log.info('[auth-invalidate] completed invalidateToken');
      })
      .catch((e) => {});
  }

  async signOut(opts) {
    const currentUser = await this.getCurrentUser();
    this.potentiallyInvalidateToken(currentUser, opts);
    await this.changeCurrentUser(null);
  }

  /**
   * Creates an OAuth authorization URL.
   * @param {Object} params - The parameters to create the authorization URL.
   * @param {string} params.clientName - The name of the client requesting authorization.
   * @param {string} params.redirectURL - The URL to redirect users to after authorization.
   * @returns {string} The created authorization URL.
   */
  createAuthorizationURL({ clientName, redirectURL }) {
    const { apiURI, appId } = this.config;
    return `${apiURI}/runtime/oauth/start?app_id=${appId}&client_name=${clientName}&redirect_uri=${redirectURL}`;
  }

  /**
   * @param {Object} params
   * @param {string} params.code - The code received from the OAuth service.
   * @param {string} [params.codeVerifier] - The code verifier used to generate the code challenge.
   */
  async exchangeCodeForToken({ code, codeVerifier }) {
    const res = await authAPI.exchangeCodeForToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      code: code,
      codeVerifier,
    });
    await this.changeCurrentUser(res.user);
    return res;
  }

  issuerURI() {
    const { apiURI, appId } = this.config;
    return `${apiURI}/runtime/${appId}`;
  }

  /**
   * @param {Object} params
   * @param {string} params.clientName - The name of the client requesting authorization.
   * @param {string} params.idToken - The id_token from the external service
   * @param {string | null | undefined} [params.nonce] - The nonce used when requesting the id_token from the external service
   */
  async signInWithIdToken({ idToken, clientName, nonce }) {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;

    const res = await authAPI.signInWithIdToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      idToken,
      clientName,
      nonce,
      refreshToken,
    });
    await this.changeCurrentUser(res.user);
    return res;
  }

  // --------
  // Rooms

  /**
   * @param {string} roomId
   * @param {any | null | undefined} [initialData] -- initial presence data to send when joining the room
   * @returns () => void
   */
  joinRoom(roomId, initialData) {
    return this.rooms.joinRoom(roomId, initialData);
  }

  // --------
  // Presence

  // TODO: look into typing again
  getPresence(roomType, roomId, opts = {}) {
    return this.rooms.getPresence(roomType, roomId, opts);
  }

  // TODO: look into typing again
  publishPresence(roomType, roomId, partialData) {
    this.rooms.publishPresence(roomId, partialData);
  }

  // TODO: look into typing again
  subscribePresence(roomType, roomId, opts, cb) {
    return this.rooms.subscribePresence(roomType, roomId, opts, cb);
  }

  // --------
  // Broadcast

  publishTopic({ roomType, roomId, topic, data }) {
    this.rooms.publishTopic({ roomType, roomId, topic, data });
  }

  subscribeTopic(roomId, topic, cb) {
    return this.rooms.subscribeTopic(roomId, topic, cb);
  }

  // --------
  // Storage

  async uploadFile(path, file, opts) {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;
    return StorageApi.uploadFile({
      ...opts,
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      path: path,
      file,
      refreshToken: refreshToken,
    });
  }

  async deleteFile(path) {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;
    const result = await StorageApi.deleteFile({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      path,
      refreshToken: refreshToken,
    });

    return result;
  }

  // Deprecated Storage API (Jan 2025)
  // ---------------------------------

  async upload(path, file) {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;
    const fileName = path || file.name;
    const url = await StorageApi.getSignedUploadUrl({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      fileName: fileName,
      refreshToken: refreshToken,
    });
    const isSuccess = await StorageApi.upload(url, file);

    return isSuccess;
  }

  async getDownloadUrl(path) {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;
    const url = await StorageApi.getDownloadUrl({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      path: path,
      refreshToken: refreshToken,
    });

    return url;
  }
}
