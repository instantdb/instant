import { PersistedObject } from './utils/PersistedObject.ts';
import * as s from './store.js';
import weakHash from './utils/weakHash.ts';
import uuid from './utils/uuid.ts';
import { Logger } from './Reactor.js';
import instaql from './instaql.js';

type SubState = {
  txId?: number;
  subscriptionId: string;
  token: string;
};

type Sub = {
  query: any;
  hash: string;
  state?: SubState;
  entities?: Array<{ entity: any; store: any }>;
};

// We could make a better type for this if we had a return type for s.toJSON
type SubsInStorage = Subs;

type Subs = { [hash: string]: Sub };

type fixme = any;

type StartMsg = {
  op: 'start-sync';
  q: string;
};

type EndMsg = {
  op: 'remove-sync';
  'subscription-id': string;
};

type ResyncMsg = {
  op: 'resync-table';
  'subscription-id': string;
  'tx-id': number;
  token: string;
};

type SendMsg = StartMsg | EndMsg | ResyncMsg;

type StartSyncOkMsg = {
  'subscription-id': string;
  'client-event-id': string;
  q: string;
  token: string;
};

type Triple = [string, string, any, number];

type SyncLoadBatchMsg = {
  'subscription-id': string;
  'join-rows': Array<Triple[]>;
};

type SyncInitFinishMsg = {
  'subscription-id': string;
  'tx-id': number;
};

type SyncUpdateTriplesMsg = {
  'subscription-id': string;
  txes: {
    'tx-id': number;
    changes: { action: 'added' | 'removed'; triple: Triple }[];
  }[];
};

type TrySend = (eventId: string, msg: SendMsg) => void;

type Config = { useDateObjects: boolean };

// Modifies the data in place because it comes directly from storage
function syncSubsFromStorage(
  parsed: SubsInStorage,
  useDateObjects: boolean,
): Subs {
  for (const key in parsed) {
    const sub = parsed[key];
    for (const e of sub.entities || []) {
      e.store = s.fromJSON(e.store);
    }
  }
  return parsed;
}

function syncSubsToStorage(subs: Subs): SubsInStorage {
  const jsonSubs = {};
  for (const key in subs) {
    const sub = subs[key];
    if (sub.entities) {
      const entities = [];
      for (const e of sub.entities) {
        entities.push({ store: s.toJSON(e.store), entity: e.entity });
      }
      jsonSubs[key] = { ...sub, entities };
    } else {
      jsonSubs[key] = sub;
    }
  }
  return jsonSubs;
}

function onMergeSubs(storageSubs: Subs | null, inMemorySubs: Subs): Subs {
  const subs = {};
  for (const [k, v] of Object.entries(inMemorySubs)) {
    subs[k] = v;
  }
  if (storageSubs) {
    for (const [k, v] of Object.entries(storageSubs)) {
      subs[k] = v;
    }
  }
  return subs;
}

function queryEntity(sub: Sub, store: any) {
  const k = Object.keys(sub.query)[0];
  const res = instaql({ store, pageInfo: null, aggregate: null }, sub.query);
  return res.data[k][0];
}

function applyChangesToStore(
  store: any,
  changes: SyncUpdateTriplesMsg['txes'][number]['changes'],
): void {
  for (const { action, triple } of changes) {
    switch (action) {
      case 'added':
        s.addTriple(store, triple);
        break;
      case 'removed':
        s.retractTriple(store, triple);
        break;
    }
  }
}

function changedFieldsOfChanges(
  store: any,
  changes: SyncUpdateTriplesMsg['txes'][number]['changes'],
): { [eid: string]: SyncTransaction['updated'][number]['changedFields'] } {
  // This will be more complicated when we include links, we can either add a
  // changedLinks field or we can have something like 'bookshelves.title`
  const changedFields = {};
  for (const { action, triple } of changes) {
    const [e, a, v] = triple;
    const field = store.attrs[a]?.['forward-identity']?.[2];
    if (!field) continue;

    const fields = changedFields[e] ?? {};
    changedFields[e] = fields;

    const oldNew = fields[field] ?? {};
    fields[field] = oldNew;

    switch (action) {
      case 'added':
        oldNew.newValue = v;
        break;
      case 'removed':
        // Only take the first thing that was removed, in case we modified things in the middle
        if (oldNew.oldValue === undefined) {
          oldNew.oldValue = v;
        }
        break;
    }
  }
  return changedFields;
}

enum CallbackEventType {
  InitialSyncBatch = 'InitialSyncBatch',
  InitialSyncComplete = 'InitialSyncComplete',
  LoadFromStorage = 'LoadFromStorage',
  SyncTransaction = 'SyncTransaction',
  Error = 'Error',
}

// XXX: Needs a type parameter for constructing the data
interface BaseCallbackEvent {
  type: CallbackEventType;
  data: fixme[];
}

interface InitialSyncBatch extends BaseCallbackEvent {
  type: CallbackEventType.InitialSyncBatch;
  batch: fixme[];
}

interface InitialSyncComplete extends BaseCallbackEvent {
  type: CallbackEventType.InitialSyncComplete;
}

interface SyncTransaction extends BaseCallbackEvent {
  type: CallbackEventType.SyncTransaction;
  added: fixme[];
  removed: fixme[];
  updated: {
    oldEntity: fixme;
    newEntity: fixme;
    changedFields: Record<string, { oldValue: fixme; newValue: fixme }>;
  }[];
}

interface LoadFromStorage extends BaseCallbackEvent {
  type: CallbackEventType.LoadFromStorage;
}

interface SetupError extends BaseCallbackEvent {
  type: CallbackEventType.Error;
  error: { message: string; hint?: any; type: string; status: number };
}

type CallbackEvent =
  | InitialSyncBatch
  | InitialSyncComplete
  | SyncTransaction
  | LoadFromStorage
  | SetupError;

type SyncCallback = (event: CallbackEvent) => void;

export class SyncTable {
  private trySend: TrySend;
  private subs: PersistedObject<Subs>;
  private callbacks: { [hash: string]: SyncCallback[] } = {};
  private config: Config;
  private idToHash: { [subscriptionId: string]: string } = {};
  private log: Logger;
  private createStore: (triples: Triple[]) => any;

  constructor(
    trySend: TrySend,
    persister: Storage,
    config: Config,
    log: Logger,
    createStore: (triples: Triple[]) => any,
  ) {
    this.trySend = trySend;
    this.config = config;
    this.log = log;
    this.createStore = createStore;

    this.subs = new PersistedObject<Subs>(
      persister,
      'subs',
      {},
      onMergeSubs,
      syncSubsToStorage,
      (x) => syncSubsFromStorage(x, this.config.useDateObjects),
    );
  }

  public beforeUnload() {
    this.subs.flush();
  }

  public subscribe(
    q: any,
    cb: SyncCallback,
  ): (keepSubscription?: boolean | null | undefined) => void {
    const hash = weakHash(q);
    this.callbacks[hash] = this.callbacks[hash] || [];
    this.callbacks[hash].push(cb);

    this.initSubscription(q, hash, cb);

    return (keepSubscription?: boolean) => {
      this.unsubscribe(hash, cb, keepSubscription);
    };
  }

  private unsubscribe(
    hash: string,
    cb: SyncCallback,
    keepSubscription: boolean | null | undefined,
  ) {
    const cbs = (this.callbacks[hash] || []).filter((x) => x !== cb);
    this.callbacks[hash] = cbs;

    if (!cbs.length) {
      delete this.callbacks[hash];
      if (keepSubscription) {
        return;
      }
      const sub = this.subs.currentValue[hash];
      if (sub?.state) {
        this.clearSubscriptionData(sub.state.subscriptionId);
      }
      this.subs.set((prev) => {
        delete prev[hash];
        return prev;
      });
    }
  }

  private sendStart(query: string) {
    // XXX: Maybe the client id would be good for something?
    this.trySend(uuid(), {
      op: 'start-sync',
      q: query,
    });
  }

  private sendResync(sub: Sub, state: SubState) {
    // Make sure we can find the hash from the subscriptionId
    this.idToHash[state.subscriptionId] = sub.hash;
    this.trySend(state.subscriptionId, {
      op: 'resync-table',
      'subscription-id': state.subscriptionId,
      // XXX: Figure out why this isn't complaining
      'tx-id': state.txId,
      token: state.token,
    });
  }

  private sendRemove(state: SubState) {
    this.trySend(uuid(), {
      op: 'remove-sync',
      'subscription-id': state.subscriptionId,
    });
  }

  private async initSubscription(query: any, hash: string, cb?: SyncCallback) {
    // Wait for storage to load so that we know if we already have an existing subscription
    await this.subs.waitForLoaded();
    const existingSub = this.subs.currentValue[hash];

    if (existingSub && existingSub.state && existingSub.state.txId) {
      this.sendResync(existingSub, existingSub.state);

      if (existingSub.entities && cb) {
        cb({
          type: CallbackEventType.LoadFromStorage,
          // XXX: Need to sort
          data: existingSub.entities.map((e) => e.entity),
        });
      }

      return;
    }

    this.subs.set((prev) => {
      prev[hash] = {
        query,
        hash: hash,
      };
      return prev;
    });

    this.sendStart(query);
  }

  public async flushPending() {
    await this.subs.waitForLoaded();
    for (const hash of Object.keys(this.callbacks)) {
      const sub = this.subs.currentValue[hash];
      if (sub) {
        await this.initSubscription(sub.query, sub.hash);
      } else {
        this.log.error('Missing sub for hash in flushPending', hash);
      }
    }
  }

  public onStartSyncOk(msg: StartSyncOkMsg) {
    const subscriptionId = msg['subscription-id'];
    const q = msg.q;
    const hash = weakHash(q);

    this.idToHash[subscriptionId] = hash;

    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error(
          'Missing sub for hash',
          hash,
          'subscription-id',
          subscriptionId,
          'query',
          q,
        );
        return prev;
      }

      sub.state = {
        subscriptionId: subscriptionId,
        token: msg.token,
      };
      return prev;
    });
  }

  private notifyCbs(hash: string, event: CallbackEvent) {
    for (const cb of this.callbacks[hash] || []) {
      cb(event);
    }
  }

  public onSyncLoadBatch(msg: SyncLoadBatchMsg) {
    const subscriptionId = msg['subscription-id'];
    const joinRows = msg['join-rows'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }

    const batch = [];
    const currentValue = this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }

      const entities = sub.entities ?? [];
      sub.entities = entities;

      for (const entRows of joinRows) {
        const store = this.createStore(entRows);
        const entity = queryEntity(sub, store);
        entities.push({ store, entity });
        batch.push(entity);
      }

      return prev;
    });

    const sub = currentValue[hash];
    if (sub.entities) {
      this.notifyCbs(hash, {
        type: CallbackEventType.InitialSyncBatch,
        data: sub.entities.map((x) => x.entity),
        batch,
      });
    }
  }

  public onSyncInitFinish(msg: SyncInitFinishMsg) {
    const subscriptionId = msg['subscription-id'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }
      const state = sub.state;
      if (!state) {
        this.log.error('Sub never set init, missing result', sub, msg);
        return prev;
      }
      state.txId = msg['tx-id'];
      return prev;
    });
  }

  public onSyncUpdateTriples(msg: SyncUpdateTriplesMsg) {
    const subscriptionId = msg['subscription-id'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }

      const state = sub.state;
      if (!state) {
        this.log.error('Missing state for sub', sub, msg);
        return prev;
      }

      for (const tx of msg.txes) {
        if (state.txId >= tx['tx-id']) {
          continue;
        }
        state.txId = tx['tx-id'];
        const idxesToDelete = [];
        // Note: this won't work as well when links are involved
        const byEid: {
          [eid: string]: SyncUpdateTriplesMsg['txes'][number]['changes'];
        } = {};
        for (const change of tx.changes) {
          const eidChanges = byEid[change.triple[0]] ?? [];
          byEid[change.triple[0]] = eidChanges;
          eidChanges.push(change);
        }

        const entities = sub.entities || [];
        sub.entities = entities;

        const updated: SyncTransaction['updated'] = [];
        // Update the existing stores, if we already know about this entity
        eidLoop: for (const [eid, changes] of Object.entries(byEid)) {
          for (const [entIdx, ent] of Object.entries(entities)) {
            if (s.hasEntity(ent.store, eid)) {
              applyChangesToStore(ent.store, changes);
              const entity = queryEntity(sub, ent.store);
              const changedFields = changedFieldsOfChanges(ent.store, changes)[
                eid
              ];
              for (const [k, { oldValue, newValue }] of Object.entries(
                changedFields || {},
              )) {
                if (oldValue === newValue) {
                  delete changedFields[k];
                }
              }
              if (entity) {
                updated.push({
                  oldEntity: ent.entity,
                  newEntity: entity,
                  changedFields: changedFields || {},
                });
                ent.entity = entity;
              } else {
                idxesToDelete.push(entIdx);
              }
              delete byEid[eid];
              continue eidLoop;
            }
          }
        }

        const added = [];
        // If we have anything left in byEid, then this must be a new entity we don't know about
        for (const [_eid, changes] of Object.entries(byEid)) {
          const store = this.createStore([]);
          applyChangesToStore(store, changes);
          const entity = queryEntity(sub, store);
          if (!entity) {
            this.log.error('No entity found after applying change', {
              sub,
              changes,
              store,
            });
            1;
            continue;
          }
          entities.push({ store, entity });
          added.push(entity);
        }

        const removed = [];

        for (const idx of idxesToDelete.sort().reverse()) {
          removed.push(entities[idx].entity);
          entities.splice(idx, 1);
        }

        this.notifyCbs(hash, {
          type: CallbackEventType.SyncTransaction,
          data: entities.map((x) => x.entity),
          added,
          removed,
          updated,
        });
      }

      return prev;
    });
  }

  private clearSubscriptionData(subscriptionId: string) {
    const hash = this.idToHash[subscriptionId];
    if (hash) {
      delete this.idToHash[subscriptionId];
      const sub = this.subs.currentValue[hash];
      if (sub.state) {
        this.sendRemove(sub.state);
      }
      this.subs.set((prev) => {
        delete prev[hash];
        return prev;
      });
      if (sub) {
        return sub;
      }
    }
  }

  public onStartSyncError(msg: {
    op: 'error';
    'original-event': StartMsg;
    'client-event-id': string;
    status: number;
    type: string;
    message?: string;
    hint?: any;
  }) {
    const hash = weakHash(msg['original-event']['q']);
    const error = {
      message: msg.message || 'Uh-oh, something went wrong. Ping Joe & Stopa.',
      status: msg.status,
      type: msg.type,
      hint: msg.hint,
    };
    this.notifyCbs(hash, { type: CallbackEventType.Error, data: [], error });
  }

  public onResyncError(msg: {
    op: 'error';
    'original-event': ResyncMsg;
    status: number;
    type: string;
  }) {
    // Clear the subscription and start from scrath on any resync error
    // This can happen if the auth changed and we need to refetch with the
    // new auth or if the subscription is too far behind.
    const subscriptionId = msg['original-event']['subscription-id'];
    const removedSub = this.clearSubscriptionData(subscriptionId);
    if (removedSub) {
      this.initSubscription(removedSub.query, removedSub.hash);
    }
  }
}
