// @ts-check

import log from "./utils/log";
import weakHash from "./utils/weakHash";
import instaql from "./instaql";
import * as instaml from "./instaml";
import * as s from "./store";
import uuid from "./utils/uuid";
import IndexedDBStorage from "./IndexedDBStorage";
import WindowNetworkListener from "./WindowNetworkListener";
import * as authAPI from "./authAPI";
import * as StorageApi from "./StorageAPI";
import { buildPresenceSlice, hasPresenceResponseChanged } from "./presence";
import { Deferred } from "./utils/Deferred";
import { PersistedObject } from "./utils/PersistedObject";
import { extractTriples } from "./model/instaqlResult";
import { areObjectsDeepEqual } from "./utils/object";
import { fromJSONWithMaps, toJSONWithMaps } from "./utils/json";

const STATUS = {
  CONNECTING: "connecting",
  OPENED: "opened",
  AUTHENTICATED: "authenticated",
  CLOSED: "closed",
  ERRORED: "errored",
};

const WS_OPEN_STATUS = 1;

const defaultConfig = {
  apiURI: "https://api.instantdb.com",
  websocketURI: "wss://api.instantdb.com/runtime/session",
};

// Param that the backend adds if this is an oauth redirect
const OAUTH_REDIRECT_PARAM = "_instant_oauth_redirect";

const currentUserKey = `currentUser`;

/**
 * @template {import('./presence').RoomSchemaShape} [RoomSchema = {}]
 */
export default class Reactor {
  attrs;
  _isOnline = true;
  _isShutdown = false;
  status = STATUS.CONNECTING;
  querySubs;
  queryCbs = {};
  authCbs = [];
  attrsCbs = [];
  mutationErrorCbs = [];
  config;
  _persister;
  pendingMutations;
  mutationDeferredStore = new Map();
  _reconnectTimeoutId = null;
  _reconnectTimeoutMs = 0;
  _ws;
  _localIdPromises = {};
  _errorMessage = null;
  /** @type {Promise<null | {error: {message: string}}>}**/
  _oauthCallbackResponse = null;

  /** @type BroadcastChannel | undefined */
  _broadcastChannel;

  _presence = {};
  _broadcastSubs = {};

  constructor(
    config,
    Storage = IndexedDBStorage,
    NetworkListener = WindowNetworkListener,
  ) {
    this.config = { ...defaultConfig, ...config };
    // This is to protect us against running
    // server-side.
    // Incidentally, window is defined in react-native
    // so this check won't pass, giving us the behavior
    // we want. It would be nicer if we had a better
    // check for server-side.
    if (typeof window === "undefined") {
      return;
    }

    if (
      "BroadcastChannel" in window &&
      typeof BroadcastChannel === "function"
    ) {
      this._broadcastChannel = new BroadcastChannel("@instantdb");
      this._broadcastChannel.addEventListener("message", async (e) => {
        if (e.data?.type === "auth") {
          const res = await this.getCurrentUser();
          this.updateUser(res.user);
        }
      });
    }

    this._oauthCallbackResponse = this._oauthLoginInit();

    this._initStorage(Storage);

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
        this._isOnline = isOnline;
        if (this._isOnline) {
          this._startSocket();
        }
      });
    });
  }

  _initStorage(Storage) {
    this._persister = new Storage(`instant_${this.config.appId}_4`);
    this.querySubs = new PersistedObject(
      this._persister,
      "querySubs",
      {},
      this._onMergeQuerySubs,
      toJSONWithMaps,
      fromJSONWithMaps,
    );
    this.pendingMutations = new PersistedObject(
      this._persister,
      "pendingMutations",
      new Map(),
      this._onMergePendingMutations,
      (x) => {
        return JSON.stringify([...x.entries()]);
      },
      (x) => {
        return new Map(JSON.parse(x));
      },
    );
  }

  _finishTransaction(ok, status, clientId, errDetails) {
    const dfd = this.mutationDeferredStore.get(clientId);
    this.mutationDeferredStore.delete(clientId);
    if (!dfd && !ok) {
      // console.erroring here, as there are no listeners to let know
      console.error("Mutation failed", { status, clientId, ...errDetails });
    }
    if (!dfd) {
      return;
    }
    if (ok) {
      dfd.resolve({ status, clientId });
    } else {
      dfd.reject({ status, clientId, ...errDetails });
    }
  }

  _setStatus(status, err) {
    this.status = status;
    this._errorMessage = err;
  }

  /**
   *  merge querySubs from storage and in memory. Has the following side
   *  effects:
   *  - We notify all queryCbs because results may been added during merge
   */
  _onMergeQuerySubs = (_storageSubs, inMemorySubs) => {
    const storageSubs = _storageSubs || {};
    const ret = { ...inMemorySubs };

    // Consider an inMemorySub with no result;
    // If we have a result from storageSubs, let's add it
    Object.entries(inMemorySubs).forEach(([hash, querySub]) => {
      const storageResult = storageSubs?.[hash]?.result;
      const memoryResult = querySub.result;
      if (storageResult && !memoryResult) {
        ret[hash].result = storageResult;
      }
    });

    // Consider a storageSub with no corresponding inMemorySub
    // This means that at least at this point,
    // the user has not asked to subscribe to the query.
    // We may _still_ want to add it, because in just a
    // few milliseconds, the user will ask to subscribe to the
    // query.
    // For now, we can't really tell if the user will ask to subscribe
    // or not. So for now let's just add the first 10 queries from storage.
    // Eventually, we could be smarter about this. For example,
    // we can keep usage information about which queries are popular.
    const storageKsToAdd = Object.keys(storageSubs)
      .filter((k) => !inMemorySubs[k])
      .slice(0, 10);

    storageKsToAdd.forEach((k) => {
      ret[k] = storageSubs[k];
    });

    // Okay, now we have merged our querySubs
    this.querySubs.set((_) => ret);

    this.notifyAll();
  };

  /**
   * merge pendingMutations from storage and in memory. Has a side effect of
   * sending mutations that were stored but not acked
   */
  _onMergePendingMutations = (storageMuts, inMemoryMuts) => {
    const ret = new Map([...storageMuts.entries(), ...inMemoryMuts.entries()]);
    this.pendingMutations.set((_) => ret);
    const rewrittenStorageMuts = this._rewriteMutations(
      this.attrs,
      storageMuts,
    );
    rewrittenStorageMuts.forEach((mut, k) => {
      if (!inMemoryMuts.has(k) && !mut["tx-id"]) {
        this._sendMutation(k, mut);
      }
    });
  };

  /**
   * On refresh we clear out pending mutations that we know have been applied
   * by the server and thus those mutations are applied in the instaql result
   * returned by the server
   */
  _cleanPendingMutations(txId) {
    this.pendingMutations.set((prev) => {
      const copy = new Map(prev);
      [...prev.entries()].forEach(([eventId, mut]) => {
        if (mut["tx-id"] <= txId) {
          copy.delete(eventId);
        }
      });
      return copy;
    });
  }

  _handleReceive(msg) {
    switch (msg.op) {
      case "init-ok":
        this._setStatus(STATUS.AUTHENTICATED);
        this._reconnectTimeoutMs = 0;
        this._setAttrs(msg.attrs);
        this._flushPendingMessages();
        // (EPH): set session-id, so we know
        // which item is us
        this._sessionId = msg["session-id"];
        break;
      case "add-query-ok":
        const { q, result, "processed-tx-id": addQueryTxId } = msg;
        this._cleanPendingMutations(addQueryTxId);
        const hash = weakHash(q);
        const pageInfo = result?.[0]?.data?.["page-info"];
        const aggregate = result?.[0]?.data?.["aggregate"];
        const triples = extractTriples(result);
        const store = s.createStore(this.attrs, triples);
        this.querySubs.set((prev) => {
          prev[hash].result = { store, pageInfo, aggregate };
          return prev;
        });
        this.notifyOne(hash);
        break;
      case "refresh-ok":
        const { computations, attrs, "processed-tx-id": refreshOkTxId } = msg;
        this._cleanPendingMutations(refreshOkTxId);
        this._setAttrs(attrs);
        const updates = computations.map((x) => {
          const q = x["instaql-query"];
          const result = x["instaql-result"];
          const hash = weakHash(q);
          const triples = extractTriples(result);
          const store = s.createStore(this.attrs, triples);
          const pageInfo = result?.[0]?.data?.["page-info"];
          const aggregate = result?.[0]?.data?.["aggregate"];
          return { hash, store, pageInfo, aggregate };
        });
        updates.forEach(({ hash, store, pageInfo, aggregate }) => {
          this.querySubs.set((prev) => {
            prev[hash].result = { store, pageInfo, aggregate };
            return prev;
          });
        });
        updates.forEach(({ hash }) => {
          this.notifyOne(hash);
        });
        break;
      case "transact-ok":
        const { "client-event-id": eventId, "tx-id": txId } = msg;
        const muts = this._rewriteMutations(
          this.attrs,
          this.pendingMutations.currentValue,
        );
        const prevMutation = muts.get(eventId);
        if (!prevMutation) {
          break;
        }

        const mut = { ...prevMutation, "tx-id": txId };

        this.pendingMutations.set((prev) => {
          prev.set(eventId, mut);
          return prev;
        });

        this._finishTransaction(true, "synced", eventId);

        const newAttrs = prevMutation["tx-steps"]
          .filter(([action, ..._args]) => action === "add-attr")
          .map(([_action, attr]) => attr)
          .concat(Object.values(this.attrs));
        this._setAttrs(newAttrs);
        break;
      case "refresh-presence":
        const roomId = msg["room-id"];
        this._setPresencePeers(roomId, msg.data);
        this._notifyPresenceSubs(roomId);
        break;
      case "server-broadcast":
        const room = msg["room-id"];
        const topic = msg.topic;
        this._notifyBroadcastSubs(room, topic, msg);
        break;
      case "join-room-ok":
        const loadingRoomId = msg["room-id"];
        const loadingRoom = this._presence[loadingRoomId];
        if (loadingRoom) {
          loadingRoom.isLoading = false;
        }
        this._notifyPresenceSubs(loadingRoomId);
        break;
      case "join-room-error":
        const errorRoomId = msg["room-id"];
        const errorRoom = this._presence[errorRoomId];
        if (errorRoom) {
          errorRoom.error = msg["error"];
        }
        this._notifyPresenceSubs(errorRoomId);
        break;
      case "error":
        this._handleReceiveError(msg);
        break;
      default:
        break;
    }
  }

  _handleReceiveError(msg) {
    const eventId = msg["client-event-id"];
    const prevMutation = this.pendingMutations.currentValue.get(eventId);
    if (prevMutation) {
      // This must be a transaction error
      this.pendingMutations.set((prev) => {
        prev.delete(eventId);
        return prev;
      });
      this.notifyAll();
      this.notifyAttrsSubs();
      this.notifyMutationErrorSubs(msg);
      const errDetails = {
        message: msg.message,
        hint: msg.hint,
      };
      this._finishTransaction(false, "error", eventId, errDetails);
      return;
    }

    const q = msg.q || msg["original-event"]?.q;
    if (q) {
      // This must be a query error
      this.querySubs.set((prev) => {
        const hash = weakHash(q);
        delete prev[hash];
        return prev;
      });
      this.notifyQueryError(weakHash(q), {
        message:
          msg.message || "Uh-oh, something went wrong. Ping Joe & Stopa.",
      });
      return;
    }

    const isInitError = msg["original-event"]?.op === "init";
    if (isInitError) {
      if (
        msg.type === "record-not-found" &&
        msg.hint?.["record-type"] === "app-user"
      ) {
        // User has been logged out
        this.changeCurrentUser(null);
        return;
      }

      // We failed to init
      const errorMessage = {
        message:
          msg.message || "Uh-oh, something went wrong. Ping Joe & Stopa.",
      };
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
        "This error comes with some debugging information. Here it is: \n",
        msg.hint,
      );
    }
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
  subscribeQuery(q, cb) {
    const eventId = uuid();
    const hash = weakHash(q);

    this.queryCbs[hash] = this.queryCbs[hash] || [];
    this.queryCbs[hash].push(cb);
    this.querySubs.set((prev) => {
      prev[hash] = prev[hash] || { q, result: null, eventId };
      return prev;
    });
    this._trySendAuthed(eventId, { op: "add-query", q });
    const errorMessage = this._errorMessage;
    const prevResult = this.querySubs.currentValue?.[hash]?.result;
    if (errorMessage) {
      cb({ error: errorMessage });
    } else if (prevResult) {
      cb(this.dataForResult(q, prevResult));
    }
    return () => {
      this.queryCbs[hash] = this.queryCbs[hash].filter((x) => x !== cb);
    };
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
  _rewriteMutations(attrs, muts) {
    if (!attrs) return muts;
    const findExistingAttr = ([action, attr]) => {
      if (action !== "add-attr") {
        return;
      }
      const [_, etype, label] = attr["forward-identity"];
      const existing = instaml.getAttrByFwdIdentName(attrs, etype, label);
      return existing;
    };
    const rewriteTxSteps = (mapping, txSteps) => {
      return txSteps.reduce(
        ([mapping, retTxSteps], txStep) => {
          // Handles add-attr
          // If existing, we drop it, and track it
          // to update add/retract triples
          const existing = findExistingAttr(txStep);
          if (existing) {
            const [_action, attr] = txStep;
            mapping[attr.id] = existing.id;
            return [mapping, retTxSteps];
          }
          // Handles add-triple|retract-triple
          // If in mapping, we update the attr-id
          const [action, eid, attrId, ...rest] = txStep;
          const newTxStep = mapping[attrId]
            ? [action, eid, mapping[attrId], ...rest]
            : txStep;
          retTxSteps.push(newTxStep);
          return [mapping, retTxSteps];
        },
        [mapping, []],
      );
    };
    const [_, __, rewritten] = [...muts.entries()].reduce(
      ([attrs, mapping, newMuts], [k, mut]) => {
        const [newMapping, newTxSteps] = rewriteTxSteps(
          mapping,
          mut["tx-steps"],
        );
        newMuts.set(k, { ...mut, "tx-steps": newTxSteps });
        return [attrs, newMapping, newMuts];
      },
      [attrs, {}, new Map()],
    );
    return rewritten;
  }

  // ---------------------------
  // Transact

  optimisticAttrs() {
    const pendingMutationSteps = [
      ...this.pendingMutations.currentValue.values(),
    ] // hack due to Map()
      .flatMap((x) => x["tx-steps"]);

    const deletedAttrIds = new Set(
      pendingMutationSteps
        .filter(([action, _attr]) => action === "delete-attr")
        .map(([_action, id]) => id),
    );

    const pendingAttrs = [];
    for (const [_action, attr] of pendingMutationSteps) {
      if (_action === "add-attr") {
        pendingAttrs.push(attr);
      } else if (
        _action === "update-attr" &&
        attr.id &&
        this.attrs?.[attr.id]
      ) {
        const fullAttr = { ...this.attrs[attr.id], ...attr };
        pendingAttrs.push(fullAttr);
      }
    }

    const attrsWithoutDeleted = [
      ...Object.values(this.attrs || {}),
      ...pendingAttrs,
    ].filter((a) => !deletedAttrIds.has(a.id));

    const attrsRecord = Object.fromEntries(
      attrsWithoutDeleted.map((a) => [a.id, a]),
    );

    return attrsRecord;
  }

  /** Runs instaql on a query and a store */
  dataForResult(q, { store, pageInfo, aggregate }) {
    const muts = this._rewriteMutations(
      store.attrs,
      this.pendingMutations.currentValue,
    );
    const txSteps = [...muts.values()].flatMap((x) => x["tx-steps"]);
    const newStore = s.transact(store, txSteps);
    const resp = instaql({ store: newStore, pageInfo, aggregate }, q);
    return resp;
  }

  /** Re-run instaql and call all callbacks with new data */
  notifyOne = (hash) => {
    const cbs = this.queryCbs[hash] || [];
    if (!cbs) return;
    const errorMessage = this._errorMessage;
    if (errorMessage) {
      cbs.forEach((cb) => cb({ error: errorMessage }));
      return;
    }

    const { q, result, iqlResult } = this.querySubs.currentValue[hash] || {};
    if (!result) return; // No store data, no need to notify

    const resp = this.dataForResult(q, result);

    if (areObjectsDeepEqual(resp.data, iqlResult)) return; // No change, no need to notify

    this.querySubs.currentValue[hash].iqlResult = result.data;
    cbs.forEach((cb) => cb(resp));
  };

  notifyQueryError = (hash, msg) => {
    const cbs = this.queryCbs[hash] || [];
    cbs.forEach((cb) => cb({ error: msg }));
  };

  /** Re-compute all subscriptions */
  notifyAll() {
    Object.keys(this.queryCbs).forEach((hash) => {
      this.notifyOne(hash);
    });
  }

  /** Applies transactions locally and sends transact message to server */
  pushTx = (chunks) => {
    const txSteps = instaml.transform(this.optimisticAttrs(), chunks);
    return this.pushOps(txSteps);
  };

  pushOps = (txSteps) => {
    const eventId = uuid();
    const mutation = {
      op: "transact",
      "tx-steps": txSteps,
    };
    this.pendingMutations.set((prev) => {
      prev.set(eventId, mutation);
      return prev;
    });

    const dfd = new Deferred();
    this.mutationDeferredStore.set(eventId, dfd);
    this._sendMutation(eventId, mutation);

    this.notifyAll();

    return dfd.promise;
  };

  shutdown() {
    this._isShutdown = true;
    this._ws.close();
  }

  /**
   * Sends mutation to server and schedules a timeout to cancel it if
   * we don't hear back in time.
   * Note: If we're offline we don't schedule a timeout, we'll schedule it
   * later once we're back online and send the mutation again
   *
   */
  _sendMutation(eventId, mutation) {
    if (this.status !== STATUS.AUTHENTICATED) {
      this._finishTransaction(true, "enqueued", eventId);
      return;
    }
    const timeoutMs = Math.max(
      5000,
      this.pendingMutations.currentValue.size * 5000,
    );

    if (!this._isOnline) {
      this._finishTransaction(true, "enqueued", eventId);
    } else {
      this._trySend(eventId, mutation);

      // If a transaction is pending for over 3 seconds,
      // we want to unblock the UX, so mark it as pending
      // and keep trying to process the transaction in the background
      window.setTimeout(() => {
        this._finishTransaction(true, "pending", eventId);
      }, 3_000);

      window.setTimeout(() => {
        if (!this._isOnline) {
          return;
        }

        // If we are here, this means that we have sent this mutation, we are online
        // but we have not received a response. If it's this long, something must be worng,
        // so we error with a timeout.
        const mut = this.pendingMutations.currentValue.get(eventId);
        if (mut && !mut["tx-id"]) {
          this.pendingMutations.set((prev) => {
            prev.delete(eventId);
            return prev;
          });

          this._finishTransaction(false, "timeout", eventId);

          console.error("mutation timed out", mut);
        }
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
      this._trySendAuthed(eventId, { op: "add-query", q });
    });
    const muts = this._rewriteMutations(
      this.attrs,
      this.pendingMutations.currentValue,
    );
    muts.forEach((mut, eventId) => {
      if (!mut["tx-id"]) {
        this._sendMutation(eventId, mut);
      }
    });
    const roomIds = Object.keys(this._presence);
    roomIds.forEach((roomId) => {
      this._trySendAuthed(uuid(), { op: "join-room", "room-id": roomId });
    });
    const presence = Object.entries(this._presence);
    presence.forEach(([roomId, { result }]) => {
      const user = result?.user;
      if (!user) return;
      this._trySendAuthed(uuid(), {
        op: "set-presence",
        "room-id": roomId,
        data: user,
      });
    });
  }

  _trySendAuthed(eventId, msg) {
    if (this.status !== STATUS.AUTHENTICATED) {
      return;
    }
    this._trySend(eventId, msg);
  }

  _trySend(eventId, msg) {
    if (this._ws.readyState !== WS_OPEN_STATUS) {
      return;
    }
    this._ws.send(JSON.stringify({ "client-event-id": eventId, ...msg }));
  }

  _wsOnOpen = () => {
    log.info("[socket] connected");
    this._setStatus(STATUS.OPENED);
    this.getCurrentUser().then((resp) => {
      this._trySend(uuid(), {
        op: "init",
        "app-id": this.config.appId,
        "refresh-token": resp.user?.["refresh_token"],
        // If an admin token is provided for an app, we will
        // skip all permission checks. This is an advanced feature,
        // to let users write internal tools
        // This option is not exposed in `Config`, as it's
        // not ready for prme time
        "__admin-token": this.config.__adminToken,
      });
    });
  };

  _wsOnMessage = (e) => {
    this._handleReceive(JSON.parse(e.data.toString()));
  };

  _wsOnError = (e) => {
    log.error("[socket] error: ", e);
  };

  _wsOnClose = () => {
    this._setStatus(STATUS.CLOSED);

    if (this._isShutdown) {
      log.info(
        "[socket-close] socket has been shut down and will not reconnect",
      );
      return;
    }

    log.info("[socket-close] scheduling reconnect", this._reconnectTimeoutMs);
    setTimeout(() => {
      this._reconnectTimeoutMs = Math.min(
        this._reconnectTimeoutMs + 1000,
        10000,
      );
      if (!this._isOnline) {
        log.info("[socket-close] we are offline, no need to start socket");
        return;
      }
      this._startSocket();
    }, this._reconnectTimeoutMs);
  };

  _startSocket() {
    this._ws = new WebSocket(
      `${this.config.websocketURI}?app_id=${this.config.appId}`,
    );
    this._ws.onopen = this._wsOnOpen;
    this._ws.onmessage = this._wsOnMessage;
    this._ws.onclose = this._wsOnClose;
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
    if (typeof URL === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get(OAUTH_REDIRECT_PARAM)) {
      const startUrl = url.toString();
      url.searchParams.delete(OAUTH_REDIRECT_PARAM);
      url.searchParams.delete("code");
      url.searchParams.delete("error");
      const newPath =
        url.pathname +
        (url.searchParams.size ? "?" + url.searchParams : "") +
        url.hash;
      // Note: In next.js, this will revert to the old state if user navigates
      //       back. We would need to allow framework specific routing to work
      //       around that problem.
      history.replaceState(history.state, "", newPath);

      // navigation is part of the HTML spec, but not supported by Safari
      // or Firefox yet:
      // https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API#browser_compatibility
      if (
        // @ts-ignore (waiting for ts support)
        typeof navigation === "object" &&
        // @ts-ignore (waiting for ts support)
        typeof navigation.addEventListener === "function" &&
        // @ts-ignore (waiting for ts support)
        typeof navigation.removeEventListener === "function"
      ) {
        let ran = false;

        // The next.js app router will reset the URL when the router loads.
        // This puts it back after the router loads.
        const listener = (e) => {
          if (!ran) {
            ran = true;
            // @ts-ignore (waiting for ts support)
            navigation.removeEventListener("navigate", listener);
            if (
              !e.userInitiated &&
              e.navigationType === "replace" &&
              e.destination?.url === startUrl
            ) {
              history.replaceState(history.state, "", newPath);
            }
          }
        };
        // @ts-ignore (waiting for ts support)
        navigation.addEventListener("navigate", listener);
      }
    }
  }

  /**
   *
   * @returns Promise<null | {error: {message: string}}>
   */
  async _oauthLoginInit() {
    if (
      typeof window === "undefined" ||
      typeof window.location === "undefined" ||
      typeof URLSearchParams === "undefined"
    ) {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.get(OAUTH_REDIRECT_PARAM)) {
      return null;
    }

    const error = params.get("error");
    if (error) {
      this._replaceUrlAfterOAuth();
      return { error: { message: error } };
    }
    const code = params.get("code");
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
        e?.body?.type === "record-not-found" &&
        e?.body?.hint?.["record-type"] === "app-oauth-code" &&
        (await this._hasCurrentUser())
      ) {
        // We probably just weren't able to clean up the URL, so
        // let's just ignore this error
        return null;
      }
      const message = e?.body?.message || "Error logging in.";
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
    let unsubbed = false;
    this.getCurrentUser().then((resp) => {
      if (unsubbed) return;
      cb(resp);
    });
    return () => {
      unsubbed = true;
      this.authCbs = this.authCbs.filter((x) => x !== cb);
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

  notifyMutationErrorSubs(error) {
    this.mutationErrorCbs.forEach((cb) => cb(error));
  }

  notifyAttrsSubs() {
    if (!this.attrs) return;
    const oas = this.optimisticAttrs();
    this.attrsCbs.forEach((cb) => cb(oas));
  }

  async setCurrentUser(user) {
    await this._persister.setItem(currentUserKey, JSON.stringify(user));
  }

  async getCurrentUser() {
    const oauthResp = await this._waitForOAuthCallbackResponse();
    if (oauthResp?.error) {
      return { error: oauthResp.error };
    }
    const user = await this._persister.getItem(currentUserKey);
    return { user: JSON.parse(user) };
  }

  async _hasCurrentUser() {
    const user = await this._persister.getItem(currentUserKey);
    return JSON.parse(user) != null;
  }

  async changeCurrentUser(newUser) {
    await this.setCurrentUser(newUser);
    // We need to remove all `result` from querySubs,
    // as they are no longer valid for the new user
    this.updateUser(newUser);

    try {
      this._broadcastChannel?.postMessage({ type: "auth" });
    } catch (error) {
      console.error("Error posting message to broadcast channel", error);
    }
  }

  updateUser(newUser) {
    this.querySubs.set((prev) => {
      Object.keys(prev).forEach((k) => {
        delete prev[k].result;
      });
      return prev;
    });
    this._reconnectTimeoutMs = 0;
    this._ws.close();
    this._oauthCallbackResponse = null;
    this.notifyAuthSubs({ user: newUser });
  }

  sendMagicCode({ email }) {
    return authAPI.sendMagicCode({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      email: email,
    });
  }

  async signInWithMagicCode({ email, code }) {
    const res = await authAPI.verifyMagicCode({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      email,
      code,
    });
    this.changeCurrentUser(res.user);
    return res;
  }

  async signInWithCustomToken(authToken) {
    const res = await authAPI.verifyRefreshToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      refreshToken: authToken,
    });
    this.changeCurrentUser(res.user);
  }

  async signOut() {
    const currentUser = await this.getCurrentUser();
    const refreshToken = currentUser?.user?.refresh_token;
    if (refreshToken) {
      try {
        await authAPI.signOut({
          apiURI: this.config.apiURI,
          appId: this.config.appId,
          refreshToken,
        });
      } catch (e) {}
    }

    this.changeCurrentUser(null);
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

  async exchangeCodeForToken({ code, codeVerifier }) {
    const res = await authAPI.exchangeCodeForToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      code: code,
      codeVerifier,
    });
    this.changeCurrentUser(res.user);
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
   * @param {string | null | undefined} params.nonce - The nonce used when requesting the id_token from the external service
   */
  async signInWithIdToken({ idToken, clientName, nonce }) {
    const res = await authAPI.signInWithIdToken({
      apiURI: this.config.apiURI,
      appId: this.config.appId,
      idToken,
      clientName,
      nonce,
    });
    this.changeCurrentUser(res.user);
    return res;
  }

  // --------
  // Rooms

  joinRoom(roomId) {
    this._trySendAuthed(uuid(), { op: "join-room", "room-id": roomId });

    return () => {
      this._cleanupRoom(roomId);
    };
  }

  _cleanupRoom(roomId) {
    if (
      !this._presence[roomId]?.handlers?.length &&
      !Object.keys(this._broadcastSubs[roomId] ?? {}).length
    ) {
      delete this._presence[roomId];
      delete this._broadcastSubs[roomId];
      this._trySendAuthed(uuid(), { op: "leave-room", "room-id": roomId });
    }
  }

  // --------
  // Presence

  /**
   * @template {keyof RoomSchema} RoomType
   * @template {keyof RoomSchema[RoomType]['presence']} Keys
   * @param {RoomType} roomType
   * @param {string | number} roomId
   * @param {import('./presence').PresenceOpts<RoomSchema[RoomType]['presence'], Keys>} opts
   * @returns {import('./presence').PresenceResponse<RoomSchema[RoomType]['presence'], Keys>}
   */
  getPresence(roomType, roomId, opts = {}) {
    const room = this._presence[roomId];
    if (!room || !room.result) return null;

    return {
      ...buildPresenceSlice(room.result, opts),
      isLoading: room.isLoading,
      error: room.error,
    };
  }

  /**
   * @template {keyof RoomSchema} RoomType
   * @param {RoomType} roomType
   * @param {string | number} roomId
   * @param {Partial<RoomSchema[RoomType]['presence']>} partialData
   */
  publishPresence(roomType, roomId, partialData) {
    const data = {
      ...this._presence[roomId]?.result?.user,
      ...partialData,
    };

    this._trySendAuthed(uuid(), {
      op: "set-presence",
      "room-id": roomId,
      data,
    });

    this._presence[roomId] = this._presence[roomId] || {};
    this._presence[roomId].result = this._presence[roomId].result || {};
    this._presence[roomId].result.user = data;
    this._notifyPresenceSubs(roomId);
  }

  /**
   * @template {keyof RoomSchema} RoomType
   * @template {keyof RoomSchema[RoomType]['presence']} Keys
   * @param {RoomType} roomType
   * @param {string | number} roomId
   * @param {import('./presence').PresenceOpts<RoomSchema[RoomType]['presence'], Keys>} opts
   * @param {(slice: import('./presence').PresenceResponse<RoomSchema[RoomType]['presence'], Keys>) => void} cb
   * @returns {() => void}
   */
  subscribePresence(roomType, roomId, opts, cb) {
    const leaveRoom = this.joinRoom(roomId);

    const handler = { ...opts, roomId, cb, prev: null };

    this._presence[roomId] = this._presence[roomId] || {};
    this._presence[roomId].isLoading = true;
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
    const slice = this.getPresence("", roomId, handler);

    if (!slice) {
      return;
    }

    if (handler.prev && !hasPresenceResponseChanged(slice, handler.prev)) {
      return;
    }

    handler.prev = slice;
    handler.cb(slice);
  }

  _setPresencePeers(roomId, data) {
    const sessions = { ...data };
    // no need to keep track of `user`
    delete sessions[this._sessionId];
    const peers = Object.fromEntries(
      Object.entries(sessions).map(([k, v]) => [k, v.data]),
    );

    this._presence[roomId] = this._presence[roomId] || {};
    this._presence[roomId].result = this._presence[roomId].result || {};
    this._presence[roomId].result.peers = peers;
  }

  // --------
  // Broadcast

  publishTopic({ roomType, roomId, topic, data }) {
    this._trySendAuthed(uuid(), {
      op: "client-broadcast",
      "room-id": roomId,
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
        msg.data["peer-id"] === this._sessionId
          ? this._presence[room]?.result?.user
          : this._presence[room]?.result?.peers?.[msg.data["peer-id"]];

      return cb(data, peer);
    });
  }

  // --------
  // Storage

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
