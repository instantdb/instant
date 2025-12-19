// @ts-check
import weakHash from './utils/weakHash.ts';
import instaql from './instaql.ts';
import * as instaml from './instaml.ts';
import * as s from './store.ts';
import uuid from './utils/id.ts';
import IndexedDBStorage from './IndexedDBStorage.ts';
import WindowNetworkListener from './WindowNetworkListener.js';
import * as authAPI from './authAPI.ts';
import * as StorageApi from './StorageAPI.ts';
import * as flags from './utils/flags.ts';
import { buildPresenceSlice, hasPresenceResponseChanged } from './presence.ts';
import { Deferred } from './utils/Deferred.js';
import { PersistedObject } from './utils/PersistedObject.ts';

import { extractTriples } from './model/instaqlResult.js';
import {
  areObjectsDeepEqual,
  assocInMutative,
  dissocInMutative,
  insertInMutative,
} from './utils/object.js';
import { createLinkIndex } from './utils/linkIndex.ts';
import version from './version.ts';
import { create } from 'mutative';
import createLogger from './utils/log.ts';
import { validateQuery } from './queryValidation.ts';
import { validateTransactions } from './transactionValidation.ts';
import { InstantError } from './InstantError.ts';
import { InstantAPIError } from './utils/fetch.ts';
import { validate as validateUUID } from 'uuid';
import { WSConnection, SSEConnection } from './Connection.ts';
import { SyncTable } from './SyncTable.ts';

/** @typedef {import('./utils/log.ts').Logger} Logger */
/** @typedef {import('./Connection.ts').Connection} Connection */
/** @typedef {import('./Connection.ts').TransportType} TransportType */
/** @typedef {import('./Connection.ts').EventSourceConstructor} EventSourceConstructor */
/** @typedef {import('./reactorTypes.ts').QuerySub} QuerySub */
/** @typedef {import('./reactorTypes.ts').QuerySubInStorage} QuerySubInStorage */

const STATUS = {
  CONNECTING: 'connecting',
  OPENED: 'opened',
  AUTHENTICATED: 'authenticated',
  CLOSED: 'closed',
  ERRORED: 'errored',
};

const QUERY_ONCE_TIMEOUT = 30_000;
const PENDING_TX_CLEANUP_TIMEOUT = 30_000;
const PENDING_MUTATION_CLEANUP_THRESHOLD = 200;
const ONE_MIN_MS = 1_000 * 60;

const defaultConfig = {
  apiURI: 'https://api.instantdb.com',
  websocketURI: 'wss://api.instantdb.com/runtime/session',
};

// Param that the backend adds if this is an oauth redirect
const OAUTH_REDIRECT_PARAM = '_instant_oauth_redirect';

const currentUserKey = `currentUser`;

/**
 * @param {Object} config
 * @param {TransportType} config.transportType
 * @param {string} config.appId
 * @param {string} config.apiURI
 * @param {string} config.wsURI
 * @param {EventSourceConstructor} config.EventSourceImpl
 * @returns {WSConnection | SSEConnection}
 */
function createTransport({
  transportType,
  appId,
  apiURI,
  wsURI,
  EventSourceImpl,
}) {
  if (!EventSourceImpl) {
    return new WSConnection(`${wsURI}?app_id=${appId}`);
  }
  switch (transportType) {
    case 'ws':
      return new WSConnection(`${wsURI}?app_id=${appId}`);
    case 'sse':
      return new SSEConnection(
        EventSourceImpl,
        `${apiURI}/runtime/sse?app_id=${appId}`,
      );
    default:
      throw new Error('Unknown transport type ' + transportType);
  }
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
 * @param {QuerySubInStorage} x
 * @param {boolean | null} useDateObjects
 * @returns {QuerySub}
 */
function querySubFromStorage(x, useDateObjects) {
  const v = typeof x === 'string' ? JSON.parse(x) : x;

  if (v?.result?.store) {
    const attrsStore = s.attrsStoreFromJSON(
      v.result.attrsStore,
      v.result.store,
    );
    if (attrsStore) {
      const storeJSON = v.result.store;
      v.result.store = s.fromJSON(attrsStore, {
        ...storeJSON,
        useDateObjects: useDateObjects,
      });
      v.result.attrsStore = attrsStore;
    }
  }

  return v;
}

/**
 *
 * @param {string} _key
 * @param {QuerySub} sub
 * @returns QuerySubInStorage
 */
function querySubToStorage(_key, sub) {
  const { result, ...rest } = sub;
  const jsonSub = /** @type {import('./reactorTypes.ts').QuerySubInStorage} */ (
    rest
  );
  if (result) {
    /** @type {import('./reactorTypes.ts').QuerySubResultInStorage} */
    const jsonResult = {
      ...result,
      store: s.toJSON(result.store),
      attrsStore: result.attrsStore.toJSON(),
    };

    jsonSub.result = jsonResult;
  }
  return jsonSub;
}

function kvFromStorage(key, x) {
  switch (key) {
    case 'pendingMutations':
      return new Map(typeof x === 'string' ? JSON.parse(x) : x);
    default:
      return x;
  }
}

function kvToStorage(key, x) {
  switch (key) {
    case 'pendingMutations':
      return [...x.entries()];
    default:
      return x;
  }
}

function onMergeQuerySub(_k, storageSub, inMemorySub) {
  const storageResult = storageSub?.result;
  const memoryResult = inMemorySub?.result;
  if (storageResult && !memoryResult && inMemorySub) {
    inMemorySub.result = storageResult;
  }
  return inMemorySub || storageSub;
}

function sortedMutationEntries(entries) {
  return [...entries].sort((a, b) => {
    const [ka, muta] = a;
    const [kb, mutb] = b;
    const a_order = muta.order || 0;
    const b_order = mutb.order || 0;
    if (a_order == b_order) {
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }
    return a_order - b_order;
  });
}

/**
 * @template {import('./presence.ts').RoomSchemaShape} [RoomSchema = {}]
 */
export default class Reactor {
  /** @type {s.AttrsStore | undefined} */
  attrs;
  _isOnline = true;
  _isShutdown = false;
  status = STATUS.CONNECTING;

  /** @type {PersistedObject<string, QuerySub, QuerySubInStorage>} */
  querySubs;

  /** @type {PersistedObject} */
  kv;

  /** @type {SyncTable} */
  _syncTable;

  /** @type {Record<string, Array<{ q: any, cb: (data: any) => any }>>} */
  queryCbs = {};
  /** @type {Record<string, Array<{ q: any, eventId: string, dfd: Deferred }>>} */
  queryOnceDfds = {};
  authCbs = [];
  attrsCbs = [];
  mutationErrorCbs = [];
  connectionStatusCbs = [];
  config;
  mutationDeferredStore = new Map();
  _reconnectTimeoutId = null;
  _reconnectTimeoutMs = 0;
  /** @type {Connection} */
  _transport;
  /** @type {TransportType} */
  _transportType = 'ws';

  /** @type {EventSourceConstructor} */
  _EventSource;
  /** @type {boolean | null} */
  _wsOk = null;
  _localIdPromises = {};
  _errorMessage = null;
  /** @type {Promise<null | {error: {message: string}}> | null}**/
  _oauthCallbackResponse = null;

  /** @type {null | import('./utils/linkIndex.ts').LinkIndex}} */
  _linkIndex = null;

  /** @type BroadcastChannel | undefined */
  _broadcastChannel;

  /** @type {Record<string, {isConnected: boolean; error: any}>} */
  _rooms = {};
  /** @type {Record<string, boolean>} */
  _roomsPendingLeave = {};
  _presence = {};
  _broadcastQueue = [];
  _broadcastSubs = {};
  /** @type {{isLoading: boolean; error: any | undefined, user: any | undefined}} */
  _currentUserCached = { isLoading: true, error: undefined, user: undefined };
  _beforeUnloadCbs = [];
  _dataForQueryCache = {};
  /** @type {Logger} */
  _log;
  _pendingTxCleanupTimeout;
  _pendingMutationCleanupThreshold;
  _inFlightMutationEventIds = new Set();

  constructor(
    config,
    Storage = IndexedDBStorage,
    NetworkListener = WindowNetworkListener,
    versions,
    EventSourceConstructor,
  ) {
    this._EventSource = EventSourceConstructor;

    this.config = { ...defaultConfig, ...config };
    this.queryCacheLimit = this.config.queryCacheLimit ?? 10;
    this._pendingTxCleanupTimeout =
      this.config.pendingTxCleanupTimeout ?? PENDING_TX_CLEANUP_TIMEOUT;
    this._pendingMutationCleanupThreshold =
      this.config.pendingMutationCleanupThreshold ??
      PENDING_MUTATION_CLEANUP_THRESHOLD;

    this._log = createLogger(
      config.verbose || flags.devBackend || flags.instantLogs,
      () => this._reactorStats(),
    );

    this.versions = { ...(versions || {}), '@instantdb/core': version };

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

    this._initStorage(Storage);

    this._syncTable = new SyncTable(
      this._trySendAuthed.bind(this),
      new Storage(this.config.appId, 'syncSubs'),
      {
        useDateObjects: this.config.useDateObjects,
      },
      this._log,
      (triples) => {
        return s.createStore(
          this.ensureAttrs(),
          triples,
          this.config.enableCardinalityInference,
          this.config.useDateObjects,
        );
      },
      () => this.ensureAttrs(),
    );

    this._oauthCallbackResponse = this._oauthLoginInit();

    // kick off a request to cache it
    this.getCurrentUser().then((userInfo) => {
      this.syncUserToEndpoint(userInfo.user);
    });

    setInterval(async () => {
      const currentUser = await this.getCurrentUser();
      this.syncUserToEndpoint(currentUser.user);
    }, ONE_MIN_MS);

    NetworkListener.getIsOnline().then((isOnline) => {
      this._isOnline = isOnline;
      this._startSocket();
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
          this._startSocket();
        } else {
          this._log.info(
            'Changing status from',
            this.status,
            'to',
            STATUS.CLOSED,
          );
          this._setStatus(STATUS.CLOSED);
        }
      });
    });

    if (typeof addEventListener !== 'undefined') {
      this._beforeUnload = this._beforeUnload.bind(this);
      addEventListener('beforeunload', this._beforeUnload);
    }
  }

  ensureAttrs() {
    if (!this.attrs) {
      throw new Error('attrs have not loaded.');
    }
    return this.attrs;
  }

  updateSchema(schema) {
    this.config = {
      ...this.config,
      schema: schema,
      cardinalityInference: Boolean(schema),
    };
    this._linkIndex = schema ? createLinkIndex(this.config.schema) : null;
  }

  _reactorStats() {
    return {
      inFlightMutationCount: this._inFlightMutationEventIds.size,
      storedMutationCount: this._pendingMutations().size,
      transportType: this._transportType,
    };
  }

  _onQuerySubLoaded(hash) {
    this.kv
      .waitForKeyToLoad('pendingMutations')
      .then(() => this.notifyOne(hash));
  }

  _initStorage(Storage) {
    this.querySubs = new PersistedObject({
      persister: new Storage(this.config.appId, 'querySubs'),
      merge: onMergeQuerySub,
      serialize: querySubToStorage,
      parse: (_key, x) => querySubFromStorage(x, this.config.useDateObjects),
      // objectSize
      objectSize: (x) => x?.result?.store?.triples?.length ?? 0,
      logger: this._log,
      preloadEntryCount: 10,
      gc: {
        maxAgeMs: 1000 * 60 * 60 * 24 * 7 * 52, // 1 year
        maxEntries: 1000,
        // Size of each query is the number of triples
        maxSize: 1_000_000, // 1 million triples
      },
    });
    this.querySubs.onKeyLoaded = (k) => this._onQuerySubLoaded(k);
    this.kv = new PersistedObject({
      persister: new Storage(this.config.appId, 'kv'),
      merge: this._onMergeKv,
      serialize: kvToStorage,
      parse: kvFromStorage,
      objectSize: () => 0,
      logger: this._log,
      saveThrottleMs: 100,
      idleCallbackMaxWaitMs: 100,
      // Don't GC the kv store
      gc: null,
    });
    this.kv.onKeyLoaded = (k) => {
      if (k === 'pendingMutations') {
        this.notifyAll();
      }
    };
    // Trigger immediate load for pendingMutations and currentUser
    this.kv.waitForKeyToLoad('pendingMutations');
    this.kv.waitForKeyToLoad(currentUserKey);
    this._beforeUnloadCbs.push(() => {
      this.kv.flush();
      this.querySubs.flush();
    });
  }

  _beforeUnload() {
    for (const cb of this._beforeUnloadCbs) {
      cb();
    }
    this._syncTable.beforeUnload();
  }

  /**
   * @param {'enqueued' | 'pending' | 'synced' | 'timeout' |  'error' } status
   * @param {string} eventId
   * @param {{message?: string, type?: string, status?: number, hint?: unknown}} [errorMsg]
   */
  _finishTransaction(status, eventId, errorMsg) {
    const dfd = this.mutationDeferredStore.get(eventId);
    this.mutationDeferredStore.delete(eventId);
    const ok = status !== 'error' && status !== 'timeout';

    if (!dfd && !ok) {
      // console.erroring here, as there are no listeners to let know
      console.error('Mutation failed', { status, eventId, ...errorMsg });
    }
    if (!dfd) {
      return;
    }
    if (ok) {
      dfd.resolve({ status, eventId });
    } else {
      // Check if error comes from server or client
      if (errorMsg?.type) {
        const { status, ...body } = errorMsg;
        dfd.reject(
          new InstantAPIError({
            // @ts-expect-error body.type is not constant typed
            body,
            status: status ?? 0,
          }),
        );
      } else {
        dfd.reject(
          new InstantError(
            errorMsg?.message || 'Unknown error',
            errorMsg?.hint,
          ),
        );
      }
    }
  }

  _setStatus(status, err) {
    this.status = status;
    this._errorMessage = err;
    this.notifyConnectionStatusSubs(status);
  }

  _onMergeKv = (key, storageV, inMemoryV) => {
    switch (key) {
      case 'pendingMutations': {
        const storageEntries = storageV?.entries() ?? [];
        const inMemoryEntries = inMemoryV?.entries() ?? [];
        const muts = new Map([...storageEntries, ...inMemoryEntries]);
        const rewrittenStorageMuts = storageV
          ? this._rewriteMutationsSorted(this.attrs, storageV)
          : [];
        rewrittenStorageMuts.forEach(([k, mut]) => {
          if (!inMemoryV?.pendingMutations?.has(k) && !mut['tx-id']) {
            this._sendMutation(k, mut);
          }
        });
        return muts;
      }
      default:
        return inMemoryV || storageV;
    }
  };

  _flushEnqueuedRoomData(roomId) {
    const enqueuedUserPresence = this._presence[roomId]?.result?.user;
    const enqueuedBroadcasts = this._broadcastQueue[roomId];

    this._broadcastQueue[roomId] = [];

    if (enqueuedUserPresence) {
      this._trySetPresence(roomId, enqueuedUserPresence);
    }

    if (enqueuedBroadcasts) {
      for (const item of enqueuedBroadcasts) {
        const { topic, roomType, data } = item;
        this._tryBroadcast(roomId, roomType, topic, data);
      }
    }
  }

  /**
   * Does the same thing as add-query-ok
   * but called as a result of receiving query info from ssr
   * @param {any} q
   * @param {{ triples: any; pageInfo: any; }} result
   * @param {boolean} enableCardinalityInference
   */
  _addQueryData(q, result, enableCardinalityInference) {
    if (!this.attrs) {
      throw new Error('Attrs in reactor have not been set');
    }
    const queryHash = weakHash(q);
    const attrsStore = this.ensureAttrs();
    const store = s.createStore(
      this.attrs,
      result.triples,
      enableCardinalityInference,
      this.config.useDateObjects,
    );
    this.querySubs.updateInPlace((prev) => {
      prev[queryHash] = {
        result: {
          store,
          attrsStore,
          pageInfo: result.pageInfo,
          processedTxId: undefined,
          isExternal: true,
        },
        q,
      };
    });
    this._cleanupPendingMutationsQueries();
    this.notifyOne(queryHash);
    this.notifyOneQueryOnce(queryHash);
    this._cleanupPendingMutationsTimeout();
  }

  _handleReceive(connId, msg) {
    // opt-out, enabled by default if schema
    const enableCardinalityInference =
      Boolean(this.config.schema) &&
      ('cardinalityInference' in this.config
        ? Boolean(this.config.cardinalityInference)
        : true);
    if (!ignoreLogging[msg.op]) {
      this._log.info('[receive]', connId, msg.op, msg);
    }
    switch (msg.op) {
      case 'init-ok': {
        this._setStatus(STATUS.AUTHENTICATED);
        this._reconnectTimeoutMs = 0;
        this._setAttrs(msg.attrs);
        this._flushPendingMessages();
        // (EPH): set session-id, so we know
        // which item is us
        this._sessionId = msg['session-id'];

        for (const roomId of Object.keys(this._rooms)) {
          const enqueuedUserPresence = this._presence[roomId]?.result?.user;
          this._tryJoinRoom(roomId, enqueuedUserPresence);
        }
        break;
      }
      case 'add-query-exists': {
        this.notifyOneQueryOnce(weakHash(msg.q));
        break;
      }
      case 'add-query-ok': {
        const { q, result } = msg;
        const hash = weakHash(q);
        if (!this._hasQueryListeners() && !this.querySubs.currentValue[hash]) {
          break;
        }
        const pageInfo = result?.[0]?.data?.['page-info'];
        const aggregate = result?.[0]?.data?.['aggregate'];
        const triples = extractTriples(result);
        const attrsStore = this.ensureAttrs();
        const store = s.createStore(
          attrsStore,
          triples,
          enableCardinalityInference,
          this.config.useDateObjects,
        );

        this.querySubs.updateInPlace((prev) => {
          if (!prev[hash]) {
            this._log.info('Missing value in querySubs', { hash, q });
            return;
          }
          prev[hash].result = {
            store,
            attrsStore,
            pageInfo,
            aggregate,
            processedTxId: msg['processed-tx-id'],
          };
        });
        this._cleanupPendingMutationsQueries();
        this.notifyOne(hash);
        this.notifyOneQueryOnce(hash);
        this._cleanupPendingMutationsTimeout();
        break;
      }
      case 'start-sync-ok': {
        this._syncTable.onStartSyncOk(msg);
        break;
      }
      case 'sync-load-batch': {
        this._syncTable.onSyncLoadBatch(msg);
        break;
      }
      case 'sync-init-finish': {
        this._syncTable.onSyncInitFinish(msg);
        break;
      }
      case 'sync-update-triples': {
        this._syncTable.onSyncUpdateTriples(msg);
        break;
      }
      case 'refresh-ok': {
        const { computations, attrs } = msg;
        const processedTxId = msg['processed-tx-id'];
        if (attrs) {
          this._setAttrs(attrs);
        }

        this._cleanupPendingMutationsTimeout();

        const rewrittenMutations = this._rewriteMutations(
          this.ensureAttrs(),
          this._pendingMutations(),
          processedTxId,
        );

        if (rewrittenMutations !== this._pendingMutations()) {
          // We know we've changed the mutations to fix the attr ids and removed
          // processed attrs, so we'll persist those changes to prevent optimisticAttrs
          // from using old attr definitions
          this.kv.updateInPlace((prev) => {
            prev.pendingMutations = rewrittenMutations;
          });
        }

        const mutations = sortedMutationEntries(rewrittenMutations.entries());

        const updates = computations.map((x) => {
          const q = x['instaql-query'];
          const result = x['instaql-result'];
          const hash = weakHash(q);
          const triples = extractTriples(result);
          const attrsStore = this.ensureAttrs();
          const store = s.createStore(
            attrsStore,
            triples,
            enableCardinalityInference,
            this.config.useDateObjects,
          );
          const { store: newStore, attrsStore: newAttrsStore } =
            this._applyOptimisticUpdates(
              store,
              attrsStore,
              mutations,
              processedTxId,
            );
          const pageInfo = result?.[0]?.data?.['page-info'];
          const aggregate = result?.[0]?.data?.['aggregate'];
          return {
            q,
            hash,
            store: newStore,
            attrsStore: newAttrsStore,
            pageInfo,
            aggregate,
          };
        });

        updates.forEach(
          ({ hash, q, store, attrsStore, pageInfo, aggregate }) => {
            this.querySubs.updateInPlace((prev) => {
              if (!prev[hash]) {
                this._log.error('Missing value in querySubs', { hash, q });
                return;
              }
              prev[hash].result = {
                store,
                attrsStore,
                pageInfo,
                aggregate,
                processedTxId,
              };
            });
          },
        );

        this._cleanupPendingMutationsQueries();

        updates.forEach(({ hash }) => {
          this.notifyOne(hash);
        });
        break;
      }
      case 'transact-ok': {
        const { 'client-event-id': eventId, 'tx-id': txId } = msg;

        this._inFlightMutationEventIds.delete(eventId);

        const muts = this._rewriteMutations(
          this.ensureAttrs(),
          this._pendingMutations(),
        );
        const prevMutation = muts.get(eventId);
        if (!prevMutation) {
          break;
        }

        // update pendingMutation with server-side tx-id
        this._updatePendingMutations((prev) => {
          prev.set(eventId, {
            ...prev.get(eventId),
            'tx-id': txId,
            confirmed: Date.now(),
          });
        });

        const newAttrs = [];
        for (const step of prevMutation['tx-steps']) {
          if (step[0] === 'add-attr') {
            const attr = step[1];
            newAttrs.push(attr);
          }
        }
        if (newAttrs.length) {
          const existingAttrs = Object.values(this.ensureAttrs().attrs);
          this._setAttrs([...existingAttrs, ...newAttrs]);
        }

        this._finishTransaction('synced', eventId);

        this._cleanupPendingMutationsTimeout();

        break;
      }
      case 'patch-presence': {
        const roomId = msg['room-id'];
        this._trySetRoomConnected(roomId, true);
        this._patchPresencePeers(roomId, msg['edits']);
        this._notifyPresenceSubs(roomId);
        break;
      }
      case 'refresh-presence': {
        const roomId = msg['room-id'];
        this._trySetRoomConnected(roomId, true);
        this._setPresencePeers(roomId, msg['data']);
        this._notifyPresenceSubs(roomId);
        break;
      }
      case 'server-broadcast': {
        const room = msg['room-id'];
        const topic = msg.topic;
        this._trySetRoomConnected(room, true);
        this._notifyBroadcastSubs(room, topic, msg);
        break;
      }
      case 'join-room-ok': {
        const loadingRoomId = msg['room-id'];
        const joinedRoom = this._rooms[loadingRoomId];

        if (!joinedRoom) {
          if (this._roomsPendingLeave[loadingRoomId]) {
            this._tryLeaveRoom(loadingRoomId);
            delete this._roomsPendingLeave[loadingRoomId];
          }

          break;
        }

        this._trySetRoomConnected(loadingRoomId, true);
        this._flushEnqueuedRoomData(loadingRoomId);
        break;
      }
      case 'leave-room-ok': {
        const roomId = msg['room-id'];
        this._trySetRoomConnected(roomId, false);
        break;
      }
      case 'join-room-error':
        const errorRoomId = msg['room-id'];
        const errorRoom = this._rooms[errorRoomId];
        if (errorRoom) {
          errorRoom.error = msg['error'];
        }
        this._notifyPresenceSubs(errorRoomId);
        break;
      case 'error':
        this._handleReceiveError(msg);
        break;
      default:
        this._log.info('Uknown op', msg.op, msg);
        break;
    }
  }

  _pendingMutations() {
    return this.kv.currentValue.pendingMutations ?? new Map();
  }

  _updatePendingMutations(f) {
    this.kv.updateInPlace((prev) => {
      const muts = prev.pendingMutations ?? new Map();
      prev.pendingMutations = muts;
      f(muts);
    });
  }

  /**
   * @param {'timeout' | 'error'} status
   * @param {string} eventId
   * @param {{message?: string, type?: string, status?: number, hint?: unknown}} errorMsg
   */
  _handleMutationError(status, eventId, errorMsg) {
    const mut = this._pendingMutations().get(eventId);

    if (mut && (status !== 'timeout' || !mut['tx-id'])) {
      this._updatePendingMutations((prev) => {
        prev.delete(eventId);
        return prev;
      });
      this._inFlightMutationEventIds.delete(eventId);
      const errDetails = {
        message: errorMsg.message,
        hint: errorMsg.hint,
      };
      this.notifyAll();
      this.notifyAttrsSubs();
      this.notifyMutationErrorSubs(errDetails);
      this._finishTransaction(status, eventId, errorMsg);
    }
  }

  _handleReceiveError(msg) {
    console.log('error', msg);
    const eventId = msg['client-event-id'];
    // This might not be a mutation, but it can't hurt to delete it
    this._inFlightMutationEventIds.delete(eventId);
    const prevMutation = this._pendingMutations().get(eventId);
    const errorMessage = {
      message: msg.message || 'Uh-oh, something went wrong. Ping Joe & Stopa.',
    };

    if (msg.hint) {
      errorMessage.hint = msg.hint;
    }

    if (prevMutation) {
      this._handleMutationError('error', eventId, msg);
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

    if (msg['original-event']?.op === 'resync-table') {
      this._syncTable.onResyncError(msg);
      return;
    }

    if (msg['original-event']?.op === 'start-sync') {
      this._syncTable.onStartSyncError(msg);
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
    const r = this.queryOnceDfds[hash]?.find((r) => r.eventId === eventId);
    if (!r) return;
    r.dfd.reject(e);
    this._completeQueryOnce(q, hash, r.dfd);
  }

  _setAttrs(attrs) {
    this.attrs = new s.AttrsStoreClass(
      attrs.reduce((acc, attr) => {
        acc[attr.id] = attr;
        return acc;
      }, {}),
      this._linkIndex,
    );

    this.notifyAttrsSubs();
  }

  // ---------------------------
  // Queries

  getPreviousResult = (q) => {
    const hash = weakHash(q);
    return this.dataForQuery(hash)?.data;
  };

  _startQuerySub(q, hash) {
    const eventId = uuid();
    this.querySubs.updateInPlace((prev) => {
      prev[hash] = prev[hash] || { q, result: null, eventId };
      prev[hash].lastAccessed = Date.now();
    });
    this._trySendAuthed(eventId, { op: 'add-query', q });

    return eventId;
  }

  subscribeTable(q, cb) {
    return this._syncTable.subscribe(q, cb);
  }

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

    const hash = weakHash(q);

    const prevResult = this.getPreviousResult(q);
    if (prevResult) {
      cb(prevResult);
    }

    this.queryCbs[hash] = this.queryCbs[hash] ?? [];
    this.queryCbs[hash].push({ q, cb });

    this._startQuerySub(q, hash);

    return () => {
      this._unsubQuery(q, hash, cb);
    };
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

    const eventId = this._startQuerySub(q, hash);

    this.queryOnceDfds[hash] = this.queryOnceDfds[hash] ?? [];
    this.queryOnceDfds[hash].push({ q, dfd, eventId });

    setTimeout(
      () => dfd.reject(new Error('Query timed out')),
      QUERY_ONCE_TIMEOUT,
    );

    return dfd.promise;
  }

  _completeQueryOnce(q, hash, dfd) {
    if (!this.queryOnceDfds[hash]) return;

    this.queryOnceDfds[hash] = this.queryOnceDfds[hash].filter(
      (r) => r.dfd !== dfd,
    );

    this._cleanupQuery(q, hash);
  }

  _unsubQuery(q, hash, cb) {
    if (!this.queryCbs[hash]) return;

    this.queryCbs[hash] = this.queryCbs[hash].filter((r) => r.cb !== cb);

    this._cleanupQuery(q, hash);
  }

  _hasQueryListeners(hash) {
    return !!(this.queryCbs[hash]?.length || this.queryOnceDfds[hash]?.length);
  }

  _cleanupQuery(q, hash) {
    const hasListeners = this._hasQueryListeners(hash);
    if (hasListeners) return;
    delete this.queryCbs[hash];
    delete this.queryOnceDfds[hash];
    delete this._dataForQueryCache[hash];
    this.querySubs.unloadKey(hash);

    this._trySendAuthed(uuid(), { op: 'remove-query', q });
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
  /**
   *
   * @param {s.AttrsStore} attrs
   * @param {any} muts
   * @param {number} [processedTxId]
   */
  _rewriteMutations(attrs, muts, processedTxId) {
    if (!attrs) return muts;
    if (!muts) return new Map();
    const findExistingAttr = (attr) => {
      const [_, etype, label] = attr['forward-identity'];
      const existing = s.getAttrByFwdIdentName(attrs, etype, label);
      return existing;
    };
    const findReverseAttr = (attr) => {
      const [_, etype, label] = attr['forward-identity'];
      const revAttr = s.getAttrByReverseIdentName(attrs, etype, label);
      return revAttr;
    };
    const mapping = { attrIdMap: {}, refSwapAttrIds: new Set() };
    let mappingChanged = false;

    const rewriteTxSteps = (txSteps, txId) => {
      const retTxSteps = [];
      for (const txStep of txSteps) {
        const [action] = txStep;

        // Handles add-attr
        // If existing, we drop it, and track it
        // to update add/retract triples
        if (action === 'add-attr') {
          const [_action, attr] = txStep;
          const existing = findExistingAttr(attr);
          if (existing && attr.id !== existing.id) {
            mapping.attrIdMap[attr.id] = existing.id;
            mappingChanged = true;
            continue;
          }
          if (attr['value-type'] === 'ref') {
            const revAttr = findReverseAttr(attr);
            if (revAttr) {
              mapping.attrIdMap[attr.id] = revAttr.id;
              mapping.refSwapAttrIds.add(attr.id);
              mappingChanged = true;
              continue;
            }
          }
        }

        if (
          (processedTxId &&
            txId &&
            processedTxId >= txId &&
            action === 'add-attr') ||
          action === 'update-attr' ||
          action === 'delete-attr'
        ) {
          mappingChanged = true;
          // Don't add this step because we already have the newer attrs
          continue;
        }
        // Handles add-triple|retract-triple
        // If in mapping, we update the attr-id
        const newTxStep = mappingChanged
          ? instaml.rewriteStep(mapping, txStep)
          : txStep;

        retTxSteps.push(newTxStep);
      }

      return mappingChanged ? retTxSteps : txSteps;
    };

    const rewritten = new Map();
    for (const [k, mut] of muts.entries()) {
      rewritten.set(k, {
        ...mut,
        'tx-steps': rewriteTxSteps(mut['tx-steps'], mut['tx-id']),
      });
    }
    if (!mappingChanged) {
      return muts;
    }
    return rewritten;
  }

  _rewriteMutationsSorted(attrs, muts) {
    return sortedMutationEntries(this._rewriteMutations(attrs, muts).entries());
  }

  // ---------------------------
  // Transact

  /**
   * @returns {s.AttrsStore}
   */
  optimisticAttrs() {
    const pendingMutationSteps = [...this._pendingMutations().values()] // hack due to Map()
      .flatMap((x) => x['tx-steps']);

    const deletedAttrIds = new Set(
      pendingMutationSteps
        .filter(([action, _attr]) => action === 'delete-attr')
        .map(([_action, id]) => id),
    );

    const pendingAttrs = [];
    for (const [_action, attr] of pendingMutationSteps) {
      if (_action === 'add-attr') {
        pendingAttrs.push(attr);
      } else if (
        _action === 'update-attr' &&
        attr.id &&
        this.attrs?.getAttr(attr.id)
      ) {
        const fullAttr = { ...this.attrs.getAttr(attr.id), ...attr };
        pendingAttrs.push(fullAttr);
      }
    }

    if (!deletedAttrIds.size && !pendingAttrs.length) {
      return this.attrs || new s.AttrsStoreClass({}, this._linkIndex);
    }

    const attrs = { ...(this.attrs?.attrs || {}) };
    for (const attr of pendingAttrs) {
      attrs[attr.id] = attr;
    }
    for (const id of deletedAttrIds) {
      delete attrs[id];
    }

    return new s.AttrsStoreClass(attrs, this._linkIndex);
  }

  /** Runs instaql on a query and a store */
  dataForQuery(hash, applyOptimistic = true) {
    const errorMessage = this._errorMessage;
    if (errorMessage) {
      return { error: errorMessage };
    }
    if (!this.querySubs) return;
    if (!this.kv.currentValue.pendingMutations) return;
    const querySubVersion = this.querySubs.version();
    const querySubs = this.querySubs.currentValue;
    const pendingMutationsVersion = this.kv.version();
    const pendingMutations = this._pendingMutations();

    const { q, result } = querySubs[hash] || {};
    if (!result) return;

    const cached = this._dataForQueryCache[hash];
    if (
      cached &&
      querySubVersion === cached.querySubVersion &&
      pendingMutationsVersion === cached.pendingMutationsVersion
    ) {
      return cached;
    }

    let store = result.store;
    let attrsStore = result.attrsStore;
    const { pageInfo, aggregate, processedTxId } = result;
    const mutations = this._rewriteMutationsSorted(
      attrsStore,
      pendingMutations,
    );
    if (applyOptimistic) {
      const optimisticResult = this._applyOptimisticUpdates(
        store,
        attrsStore,
        mutations,
        processedTxId,
      );

      store = optimisticResult.store;
      attrsStore = optimisticResult.attrsStore;
    }
    const resp = instaql(
      { store: store, attrsStore: attrsStore, pageInfo, aggregate },
      q,
    );

    return { data: resp, querySubVersion, pendingMutationsVersion };
  }

  _applyOptimisticUpdates(store, attrsStore, mutations, processedTxId) {
    for (const [_, mut] of mutations) {
      if (!mut['tx-id'] || (processedTxId && mut['tx-id'] > processedTxId)) {
        const result = s.transact(store, attrsStore, mut['tx-steps']);
        store = result.store;
        attrsStore = result.attrsStore;
      }
    }
    return { store, attrsStore };
  }

  /** Re-run instaql and call all callbacks with new data */
  notifyOne = (hash) => {
    const cbs = this.queryCbs[hash] ?? [];
    const prevData = this._dataForQueryCache[hash]?.data;
    const resp = this.dataForQuery(hash);

    if (!resp?.data) return;
    this._dataForQueryCache[hash] = resp;
    if (areObjectsDeepEqual(resp.data, prevData)) return;

    cbs.forEach((r) => r.cb(resp.data));
  };

  notifyOneQueryOnce = (hash) => {
    const dfds = this.queryOnceDfds[hash] ?? [];
    const data = this.dataForQuery(hash)?.data;

    dfds.forEach((r) => {
      this._completeQueryOnce(r.q, hash, r.dfd);
      r.dfd.resolve(data);
    });
  };

  notifyQueryError = (hash, error) => {
    const cbs = this.queryCbs[hash] || [];
    cbs.forEach((r) => r.cb({ error }));
  };

  /** Re-compute all subscriptions */
  notifyAll() {
    Object.keys(this.queryCbs).forEach((hash) => {
      this.querySubs
        .waitForKeyToLoad(hash)
        .then(() => this.notifyOne(hash))
        .catch(() => this.notifyOne(hash));
    });
  }

  loadedNotifyAll() {
    this.kv
      .waitForKeyToLoad('pendingMutations')
      .then(() => this.notifyAll())
      .catch(() => this.notifyAll());
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
          attrsStore: this.optimisticAttrs(),
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
    const eventId = uuid();
    const mutations = [...this._pendingMutations().values()];
    const order = Math.max(0, ...mutations.map((mut) => mut.order || 0)) + 1;
    const mutation = {
      op: 'transact',
      'tx-steps': txSteps,
      created: Date.now(),
      error,
      order,
    };
    this._updatePendingMutations((prev) => {
      prev.set(eventId, mutation);
    });

    const dfd = new Deferred();
    this.mutationDeferredStore.set(eventId, dfd);
    this._sendMutation(eventId, mutation);

    this.notifyAll();

    return dfd.promise;
  };

  shutdown() {
    this._log.info('[shutdown]', this.config.appId);
    this._isShutdown = true;
    this._transport?.close();
  }

  /**
   * Sends mutation to server and schedules a timeout to cancel it if
   * we don't hear back in time.
   * Note: If we're offline we don't schedule a timeout, we'll schedule it
   * later once we're back online and send the mutation again
   *
   */
  _sendMutation(eventId, mutation) {
    if (mutation.error) {
      this._handleMutationError('error', eventId, {
        message: mutation.error.message,
      });
      return;
    }
    if (this.status !== STATUS.AUTHENTICATED) {
      this._finishTransaction('enqueued', eventId);
      return;
    }
    const timeoutMs = Math.max(
      6000,
      Math.min(
        this._inFlightMutationEventIds.size + 1,
        // Defensive code in case we don't clean up in flight mutation event ids
        this._pendingMutations().size + 1,
      ) * 6000,
    );

    if (!this._isOnline) {
      this._finishTransaction('enqueued', eventId);
    } else {
      this._trySend(eventId, mutation);

      setTimeout(() => {
        if (!this._isOnline) {
          return;
        }
        // If we are here, this means that we have sent this mutation, we are online
        // but we have not received a response. If it's this long, something must be wrong,
        // so we error with a timeout.
        this._handleMutationError('timeout', eventId, {
          message: 'transaction timed out',
        });
      }, timeoutMs);
    }
  }

  // ---------------------------
  // Websocket

  /** Send messages we accumulated while we were connecting */
  _flushPendingMessages() {
    const subs = Object.keys(this.queryCbs).map((hash) => {
      return this.querySubs.currentValue[hash];
    });
    // Note: we should not have any nulls in subs, but we're
    // doing this defensively just in case.
    const safeSubs = subs.filter((x) => x);
    safeSubs.forEach(({ eventId, q }) => {
      this._trySendAuthed(eventId, { op: 'add-query', q });
    });

    Object.values(this.queryOnceDfds)
      .flat()
      .forEach(({ eventId, q }) => {
        this._trySendAuthed(eventId, { op: 'add-query', q });
      });

    const muts = this._rewriteMutationsSorted(
      this.ensureAttrs(),
      this._pendingMutations(),
    );
    muts.forEach(([eventId, mut]) => {
      if (!mut['tx-id']) {
        this._sendMutation(eventId, mut);
      }
    });

    this._syncTable.flushPending();
  }

  /**
   * Clean up pendingMutations that all queries have seen
   */
  _cleanupPendingMutationsQueries() {
    let minProcessedTxId = Number.MAX_SAFE_INTEGER;
    for (const { result } of Object.values(this.querySubs.currentValue)) {
      if (result?.processedTxId) {
        minProcessedTxId = Math.min(minProcessedTxId, result?.processedTxId);
      }
    }

    this._updatePendingMutations((prev) => {
      for (const [eventId, mut] of Array.from(prev.entries())) {
        if (mut['tx-id'] && mut['tx-id'] <= minProcessedTxId) {
          prev.delete(eventId);
        }
      }
    });
  }

  /**
   * After mutations is confirmed by server, we give each query 30 sec
   * to update its results. If that doesn't happen, we assume query is
   * unaffected by this mutation and it’s safe to delete it from local queue
   */
  _cleanupPendingMutationsTimeout() {
    if (this._pendingMutations().size < this._pendingMutationCleanupThreshold) {
      return;
    }

    const now = Date.now();

    this._updatePendingMutations((prev) => {
      for (const [eventId, mut] of Array.from(prev.entries())) {
        if (
          mut.confirmed &&
          mut.confirmed + this._pendingTxCleanupTimeout < now
        ) {
          prev.delete(eventId);
        }
      }
    });
  }

  _trySendAuthed(...args) {
    if (this.status !== STATUS.AUTHENTICATED) {
      return;
    }
    this._trySend(...args);
  }

  _trySend(eventId, msg, opts) {
    if (!this._transport.isOpen()) {
      return;
    }
    if (!ignoreLogging[msg.op]) {
      this._log.info('[send]', this._transport.id, msg.op, msg);
    }
    switch (msg.op) {
      case 'transact': {
        this._inFlightMutationEventIds.add(eventId);
        break;
      }
      case 'init': {
        // New connection, so we can't have any mutations in flight
        this._inFlightMutationEventIds.clear();
      }
    }
    this._transport.send({ 'client-event-id': eventId, ...msg });
  }

  _transportOnOpen = (e) => {
    const targetTransport = e.target;
    if (this._transport !== targetTransport) {
      this._log.info(
        '[socket][open]',
        targetTransport.id,
        'skip; this is no longer the current transport',
      );
      return;
    }
    this._log.info('[socket][open]', this._transport.id);
    this._setStatus(STATUS.OPENED);

    this.getCurrentUser()
      .then((resp) => {
        this._trySend(uuid(), {
          op: 'init',
          'app-id': this.config.appId,
          'refresh-token': resp.user?.['refresh_token'],
          versions: this.versions,
          // If an admin token is provided for an app, we will
          // skip all permission checks. This is an advanced feature,
          // to let users write internal tools
          // This option is not exposed in `Config`, as it's
          // not ready for prime time
          '__admin-token': this.config.__adminToken,
        });
      })
      .catch((e) => {
        this._log.error('[socket][error]', targetTransport.id, e);
      });
  };

  _transportOnMessage = (e) => {
    const targetTransport = e.target;
    const m = e.message;
    if (this._transport !== targetTransport) {
      this._log.info(
        '[socket][message]',
        targetTransport.id,
        m,
        'skip; this is no longer the current transport',
      );
      return;
    }

    if (!this._wsOk && targetTransport.type === 'ws') {
      this._wsOk = true;
    }
    // Try to reconnect via websocket the next time we connect
    this._transportType = 'ws';
    if (Array.isArray(e.message)) {
      for (const msg of e.message) {
        this._handleReceive(targetTransport.id, msg);
      }
    } else {
      this._handleReceive(targetTransport.id, e.message);
    }
  };

  _transportOnError = (e) => {
    const targetTransport = e.target;
    if (this._transport !== targetTransport) {
      this._log.info(
        '[socket][error]',
        targetTransport.id,
        'skip; this is no longer the current transport',
      );
      return;
    }
    this._log.error('[socket][error]', targetTransport.id, e);
  };

  _scheduleReconnect = () => {
    // If we couldn't connect with a websocket last time, try sse
    if (!this._wsOk && this._transportType !== 'sse') {
      this._transportType = 'sse';
      this._reconnectTimeoutMs = 0;
    }
    setTimeout(() => {
      this._reconnectTimeoutMs = Math.min(
        this._reconnectTimeoutMs + 1000,
        10000,
      );
      if (!this._isOnline) {
        this._log.info(
          '[socket][close]',
          this._transport.id,
          'we are offline, no need to start socket',
        );
        return;
      }

      this._startSocket();
    }, this._reconnectTimeoutMs);
  };

  _transportOnClose = (e) => {
    const targetTransport = e.target;
    if (this._transport !== targetTransport) {
      this._log.info(
        '[socket][close]',
        targetTransport.id,
        'skip; this is no longer the current transport',
      );
      return;
    }

    this._setStatus(STATUS.CLOSED);

    for (const room of Object.values(this._rooms)) {
      room.isConnected = false;
    }

    if (this._isShutdown) {
      this._log.info(
        '[socket][close]',
        targetTransport.id,
        'Reactor has been shut down and will not reconnect',
      );
      return;
    }
    this._log.info(
      '[socket][close]',
      targetTransport.id,
      'schedule reconnect, ms =',
      this._reconnectTimeoutMs,
    );
    this._scheduleReconnect();
  };

  _startSocket() {
    // Reset whether we support websockets each time we connect
    // new networks may not support websockets
    this._wsOk = null;
    if (this._isShutdown) {
      this._log.info(
        '[socket][start]',
        this.config.appId,
        'Reactor has been shut down and will not start a new socket',
      );
      return;
    }
    if (this._transport && this._transport.isConnecting()) {
      // Our current websocket is in a 'connecting' state.
      // There's no need to start another one, as the socket is
      // effectively fresh.
      this._log.info(
        '[socket][start]',
        this._transport.id,
        'maintained as current transport, we were still in a connecting state',
      );
      return;
    }
    const prevTransport = this._transport;
    this._transport = createTransport({
      transportType: this._transportType,
      appId: this.config.appId,
      apiURI: this.config.apiURI,
      wsURI: this.config.websocketURI,
      EventSourceImpl: this._EventSource,
    });
    this._transport.onopen = this._transportOnOpen;
    this._transport.onmessage = this._transportOnMessage;
    this._transport.onclose = this._transportOnClose;
    this._transport.onerror = this._transportOnError;
    this._log.info('[socket][start]', this._transport.id);
    if (prevTransport?.isOpen()) {
      // When the network dies, it doesn't always mean that our
      // socket connection will fire a close event.
      //
      // We _could_ re-use the old socket, if the network drop was a
      // few seconds. But, to be safe right now we always create a new socket.
      //
      // This means that we have to make sure to kill the previous one ourselves.
      // c.f https://issues.chromium.org/issues/41343684
      this._log.info(
        '[socket][start]',
        this._transport.id,
        'close previous transport id = ',
        prevTransport.id,
      );
      prevTransport.close();
    }
  }

  /**
   * Given a key, returns a stable local id, unique to this device and app.
   *
   * This can be useful if you want to create guest ids for example.
   *
   * Note: If the user deletes their local storage, this id will change.
   *
   */
  async getLocalId(name) {
    const k = `localToken_${name}`;
    if (this.kv.currentValue[k]) {
      return this.kv.currentValue[k];
    }

    const current = await this.kv.waitForKeyToLoad(k);
    if (current) {
      return current;
    }
    const newId = uuid();
    this.kv.updateInPlace((prev) => {
      if (prev[k]) return;
      prev[k] = newId;
    });
    return await this.kv.waitForKeyToLoad(k);
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
      const currentUser = await this._getCurrentUser();
      const isGuest = currentUser?.type === 'guest';
      const { user } = await authAPI.exchangeCodeForToken({
        apiURI: this.config.apiURI,
        appId: this.config.appId,
        code,
        refreshToken: isGuest ? currentUser.refresh_token : undefined,
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
    this.mutationErrorCbs.push(cb);

    return () => {
      this.mutationErrorCbs = this.mutationErrorCbs.filter((x) => x !== cb);
    };
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
      cb(this.attrs.attrs);
    }

    return () => {
      this.attrsCbs = this.attrsCbs.filter((x) => x !== cb);
    };
  }

  notifyAuthSubs(user) {
    this.authCbs.forEach((cb) => cb(user));
  }

  notifyMutationErrorSubs(error) {
    this.mutationErrorCbs.forEach((cb) => cb(error));
  }

  notifyAttrsSubs() {
    if (!this.attrs) return;
    const oas = this.optimisticAttrs();
    this.attrsCbs.forEach((cb) => cb(oas.attrs));
  }

  notifyConnectionStatusSubs(status) {
    this.connectionStatusCbs.forEach((cb) => cb(status));
  }

  async setCurrentUser(user) {
    this.kv.updateInPlace((prev) => {
      prev[currentUserKey] = user;
    });
    await this.kv.waitForKeyToLoad(currentUserKey);
  }

  getCurrentUserCached() {
    return this._currentUserCached;
  }

  async _getCurrentUser() {
    const user = await this.kv.waitForKeyToLoad(currentUserKey);
    return typeof user === 'string' ? JSON.parse(user) : user;
  }

  async getCurrentUser() {
    const oauthResp = await this._waitForOAuthCallbackResponse();
    if (oauthResp?.error) {
      const errorV = { error: oauthResp.error, user: undefined };
      this._currentUserCached = { isLoading: false, ...errorV };
      return errorV;
    }
    try {
      const user = await this._getCurrentUser();
      const userV = { user: user, error: undefined };
      this._currentUserCached = {
        isLoading: false,
        ...userV,
      };
      return userV;
    } catch (e) {
      return {
        user: undefined,
        isLoading: false,
        error: { message: e?.message || 'Error loading user' },
      };
    }
  }

  async _hasCurrentUser() {
    const user = await this.kv.waitForKeyToLoad(currentUserKey);
    return typeof user === 'string' ? JSON.parse(user) != null : user != null;
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

  async syncUserToEndpoint(user) {
    if (!this.config.firstPartyPath) return;
    try {
      fetch(this.config.firstPartyPath + '/', {
        method: 'POST',
        body: JSON.stringify({
          type: 'sync-user',
          appId: this.config.appId,
          user: user,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      this._log.error('Error syncing user with external endpoint', error);
    }
  }

  updateUser(newUser) {
    this.syncUserToEndpoint(newUser);

    const newV = { error: undefined, user: newUser };
    this._currentUserCached = { isLoading: false, ...newV };
    this._dataForQueryCache = {};
    this.querySubs.updateInPlace((prev) => {
      Object.keys(prev).forEach((k) => {
        delete prev[k].result;
      });
    });
    this._reconnectTimeoutMs = 0;
    this._transport.close();
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
   *
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
    const currentUser = await this.getCurrentUser();
    const isGuest = currentUser?.user?.type === 'guest';
    const res = await authAPI.exchangeCodeForToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      code: code,
      codeVerifier,
      refreshToken: isGuest ? currentUser.user.refresh_token : undefined,
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
   * @param {any | null | undefined} [initialPresence] -- initial presence data to send when joining the room
   * @returns () => void
   */
  joinRoom(roomId, initialPresence) {
    let needsToSendJoin = false;
    if (!this._rooms[roomId]) {
      needsToSendJoin = true;
      this._rooms[roomId] = {
        isConnected: false,
        error: undefined,
      };
    }

    this._presence[roomId] = this._presence[roomId] || {};
    const previousResult = this._presence[roomId].result;
    if (initialPresence && !previousResult) {
      this._presence[roomId].result = this._presence[roomId].result || {};
      this._presence[roomId].result.user = initialPresence;
      this._notifyPresenceSubs(roomId);
    }

    if (needsToSendJoin) {
      this._tryJoinRoom(roomId, initialPresence);
    }

    return () => {
      this._cleanupRoom(roomId);
    };
  }

  _cleanupRoom(roomId) {
    if (
      !this._presence[roomId]?.handlers?.length &&
      !Object.keys(this._broadcastSubs[roomId] ?? {}).length
    ) {
      const isConnected = this._rooms[roomId]?.isConnected;

      delete this._rooms[roomId];
      delete this._presence[roomId];
      delete this._broadcastSubs[roomId];

      if (isConnected) {
        this._tryLeaveRoom(roomId);
      } else {
        this._roomsPendingLeave[roomId] = true;
      }
    }
  }

  // --------
  // Presence

  // TODO: look into typing again
  getPresence(roomType, roomId, opts = {}) {
    const room = this._rooms[roomId];
    const presence = this._presence[roomId];
    if (!room || !presence || !presence.result) return null;

    return {
      ...buildPresenceSlice(presence.result, opts, this._sessionId),
      isLoading: !room.isConnected,
      error: room.error,
    };
  }

  // TODO: look into typing again
  publishPresence(roomType, roomId, partialData) {
    const room = this._rooms[roomId];
    const presence = this._presence[roomId];

    if (!room || !presence) {
      return;
    }

    presence.result = presence.result || {};
    const data = {
      ...presence.result.user,
      ...partialData,
    };

    presence.result.user = data;

    if (!room.isConnected) {
      return;
    }

    this._trySetPresence(roomId, data);
    this._notifyPresenceSubs(roomId);
  }

  _trySetPresence(roomId, data) {
    this._trySendAuthed(uuid(), {
      op: 'set-presence',
      'room-id': roomId,
      data,
    });
  }

  _tryJoinRoom(roomId, data) {
    this._trySendAuthed(uuid(), { op: 'join-room', 'room-id': roomId, data });
    delete this._roomsPendingLeave[roomId];
  }

  _tryLeaveRoom(roomId) {
    this._trySendAuthed(uuid(), { op: 'leave-room', 'room-id': roomId });
  }

  _trySetRoomConnected(roomId, isConnected) {
    const room = this._rooms[roomId];
    if (room) {
      room.isConnected = isConnected;
    }
  }

  // TODO: look into typing again
  subscribePresence(roomType, roomId, opts, cb) {
    const leaveRoom = this.joinRoom(
      roomId,
      // Oct 28, 2025
      // Note: initialData is deprecated.
      // Keeping here for backwards compatibility
      opts.initialPresence || opts.initialData,
    );

    const handler = { ...opts, roomId, cb, prev: null };

    this._presence[roomId] = this._presence[roomId] || {};
    this._presence[roomId].handlers = this._presence[roomId].handlers || [];
    this._presence[roomId].handlers.push(handler);

    this._notifyPresenceSub(roomId, handler);

    return () => {
      this._presence[roomId].handlers =
        this._presence[roomId]?.handlers?.filter((x) => x !== handler) ?? [];

      leaveRoom();
    };
  }

  _notifyPresenceSubs(roomId) {
    this._presence[roomId]?.handlers?.forEach((handler) => {
      this._notifyPresenceSub(roomId, handler);
    });
  }

  _notifyPresenceSub(roomId, handler) {
    const slice = this.getPresence('', roomId, handler);

    if (!slice) {
      return;
    }

    if (handler.prev && !hasPresenceResponseChanged(slice, handler.prev)) {
      return;
    }

    handler.prev = slice;
    handler.cb(slice);
  }

  _patchPresencePeers(roomId, edits) {
    const peers = this._presence[roomId]?.result?.peers || {};
    let sessions = Object.fromEntries(
      Object.entries(peers).map(([k, v]) => [k, { data: v }]),
    );
    const myPresence = this._presence[roomId]?.result;
    const newSessions = create(sessions, (draft) => {
      for (let [path, op, value] of edits) {
        switch (op) {
          case '+':
            insertInMutative(draft, path, value);
            break;
          case 'r':
            assocInMutative(draft, path, value);
            break;
          case '-':
            dissocInMutative(draft, path);
            break;
        }
      }
      // Ignore our own edits
      delete draft[this._sessionId];
    });

    this._setPresencePeers(roomId, newSessions);
  }

  _setPresencePeers(roomId, data) {
    const sessions = { ...data };
    // no need to keep track of `user`
    delete sessions[this._sessionId];
    const peers = Object.fromEntries(
      Object.entries(sessions).map(([k, v]) => [k, v.data]),
    );

    this._presence = create(this._presence, (draft) => {
      assocInMutative(draft, [roomId, 'result', 'peers'], peers);
    });
  }

  // --------
  // Broadcast

  publishTopic({ roomType, roomId, topic, data }) {
    const room = this._rooms[roomId];

    if (!room) {
      return;
    }

    if (!room.isConnected) {
      this._broadcastQueue[roomId] = this._broadcastQueue[roomId] ?? [];
      this._broadcastQueue[roomId].push({ topic, roomType, data });

      return;
    }

    this._tryBroadcast(roomId, roomType, topic, data);
  }

  _tryBroadcast(roomId, roomType, topic, data) {
    this._trySendAuthed(uuid(), {
      op: 'client-broadcast',
      'room-id': roomId,
      roomType,
      topic,
      data,
    });
  }

  subscribeTopic(roomId, topic, cb) {
    const leaveRoom = this.joinRoom(roomId);

    this._broadcastSubs[roomId] = this._broadcastSubs[roomId] || {};
    this._broadcastSubs[roomId][topic] =
      this._broadcastSubs[roomId][topic] || [];
    this._broadcastSubs[roomId][topic].push(cb);
    this._presence[roomId] = this._presence[roomId] || {};

    return () => {
      this._broadcastSubs[roomId][topic] = this._broadcastSubs[roomId][
        topic
      ].filter((x) => x !== cb);

      if (!this._broadcastSubs[roomId][topic].length) {
        delete this._broadcastSubs[roomId][topic];
      }

      leaveRoom();
    };
  }

  _notifyBroadcastSubs(room, topic, msg) {
    this._broadcastSubs?.[room]?.[topic]?.forEach((cb) => {
      const data = msg.data?.data;

      const peer =
        msg.data['peer-id'] === this._sessionId
          ? this._presence[room]?.result?.user
          : this._presence[room]?.result?.peers?.[msg.data['peer-id']];

      return cb(data, peer);
    });
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
