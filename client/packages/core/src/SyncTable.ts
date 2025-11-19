import { PersistedObject } from './utils/PersistedObject.ts';
import * as s from './store.js';
import weakHash from './utils/weakHash.ts';
import uuid from './utils/uuid.ts';
import { Logger } from './Reactor.js';
import instaql, { compareOrder } from './instaql.js';
import { InstaQLResponse, ValidQuery } from './queryTypes.ts';
import { EntitiesDef, IContainEntitiesAndLinks } from './schemaTypes.ts';
import { StorageInterface } from './index.ts';

type SubState = {
  txId?: number;
  subscriptionId: string;
  token: string;
};

type Sub = {
  query: any;
  hash: string;
  table: string;
  orderField: string;
  orderDirection: 'asc' | 'desc';
  orderFieldType: 'string' | 'number' | 'date' | 'boolean';
  state?: SubState;
  values?: {
    attrs: Record<string, any>;
    entities: Array<{ entity: any; store: any; serverCreatedAt: number }>;
  };
  createdAt: number;
  updatedAt: number;
};

// We could make a better type for this if we had a return type for s.toJSON
type SubInStorage = Sub;

type StartMsg = {
  op: 'start-sync';
  q: string;
};

type EndMsg = {
  op: 'remove-sync';
  'subscription-id': string;
  'keep-subscription': boolean;
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
function syncSubFromStorage(sub: SubInStorage, useDateObjects: boolean): Sub {
  const values = sub.values;
  if (values) {
    for (const e of values.entities || []) {
      e.store.useDateObjects = useDateObjects;
      e.store.attrs = values.attrs;
      e.store = s.fromJSON(e.store);
    }
  }

  return sub;
}

function syncSubToStorage(_k: string, sub: Sub): SubInStorage {
  if (sub.values?.entities) {
    const entities = [];
    for (const e of sub.values?.entities) {
      const store = s.toJSON(e.store);
      // We'll store the attrs once on values, and put the
      // attrs back into the store on hydration
      delete store['attrs'];
      entities.push({ ...e, store });
    }
    return { ...sub, values: { ...sub.values, entities } };
  } else {
    return sub;
  }
}

function onMergeSub(
  _key: string,
  storageSub: SubInStorage | null,
  inMemorySub: Sub | null,
): Sub {
  const storageTxId = storageSub?.state.txId;
  const memoryTxId = inMemorySub?.state.txId;

  if (storageTxId && (!memoryTxId || storageTxId > memoryTxId)) {
    return storageSub;
  }

  if (memoryTxId && (!storageTxId || memoryTxId > storageTxId)) {
    return inMemorySub;
  }

  return storageSub || inMemorySub;
}

function queryEntity(sub: Sub, store: any) {
  const res = instaql({ store, pageInfo: null, aggregate: null }, sub.query);
  return res.data[sub.table][0];
}

function getServerCreatedAt(sub: Sub, store: any, entityId: string): number {
  const aid = s.getAttrByFwdIdentName(store, sub.table, 'id')?.id;
  if (!aid) {
    return -1;
  }
  const t = s.getInMap(store.eav, [entityId, aid, entityId]);
  if (!t) {
    return -1;
  }
  return t[3];
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
): {
  [eid: string]: SyncTransaction<
    any,
    any,
    any
  >['updated'][number]['changedFields'];
} {
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

function subData(sub: Sub, entities: NonNullable<Sub['values']['entities']>) {
  return { [sub.table]: entities.map((e) => e.entity) };
}

function sortEntitiesInPlace(
  sub: Sub,
  entities: NonNullable<Sub['values']['entities']>,
) {
  const dataType = sub.orderFieldType;
  if (sub.orderField === 'serverCreatedAt') {
    entities.sort(
      sub.orderDirection === 'asc'
        ? function compareEntities(a, b) {
            return compareOrder(
              a.entity.id,
              a.serverCreatedAt,
              b.entity.id,
              b.serverCreatedAt,
              dataType,
            );
          }
        : function compareEntities(b, a) {
            return compareOrder(
              a.entity.id,
              a.serverCreatedAt,
              b.entity.id,
              b.serverCreatedAt,
              dataType,
            );
          },
    );
    return;
  }

  const field = sub.orderField;

  entities.sort(
    sub.orderDirection === 'asc'
      ? function compareEntities(a, b) {
          return compareOrder(
            a.entity.id,
            a.entity[field],
            b.entity.id,
            b.entity[field],
            dataType,
          );
        }
      : function compareEntities(b, a) {
          return compareOrder(
            a.entity.id,
            a.entity[field],
            b.entity.id,
            b.entity[field],
            dataType,
          );
        },
  );
}

export enum CallbackEventType {
  InitialSyncBatch = 'InitialSyncBatch',
  InitialSyncComplete = 'InitialSyncComplete',
  LoadFromStorage = 'LoadFromStorage',
  SyncTransaction = 'SyncTransaction',
  Error = 'Error',
}

type QueryEntities<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> = InstaQLResponse<Schema, Q, UseDates>[keyof InstaQLResponse<
  Schema,
  Q,
  UseDates
>];

type QueryEntity<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> = QueryEntities<Schema, Q, UseDates> extends (infer E)[] ? E : never;

type ChangedFields<Entity> = {
  [K in keyof Entity]?: {
    oldValue: Entity[K];
    newValue: Entity[K];
  };
};

export interface BaseCallbackEvent<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> {
  type: CallbackEventType;
  data: InstaQLResponse<Schema, Q, UseDates>;
}

export interface InitialSyncBatch<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> extends BaseCallbackEvent<Schema, Q, UseDates> {
  type: CallbackEventType.InitialSyncBatch;
  batch: QueryEntities<Schema, Q, UseDates>;
}

export interface InitialSyncComplete<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> extends BaseCallbackEvent<Schema, Q, UseDates> {
  type: CallbackEventType.InitialSyncComplete;
}

export interface SyncTransaction<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> extends BaseCallbackEvent<Schema, Q, UseDates> {
  type: CallbackEventType.SyncTransaction;
  added: QueryEntities<Schema, Q, UseDates>;
  removed: QueryEntities<Schema, Q, UseDates>;
  updated: {
    oldEntity: QueryEntity<Schema, Q, UseDates>;
    newEntity: QueryEntity<Schema, Q, UseDates>;
    changedFields: ChangedFields<QueryEntity<Schema, Q, UseDates>>;
  }[];
}

export interface LoadFromStorage<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> extends BaseCallbackEvent<Schema, Q, UseDates> {
  type: CallbackEventType.LoadFromStorage;
}

export interface SetupError<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> extends BaseCallbackEvent<Schema, Q, UseDates> {
  type: CallbackEventType.Error;
  error: { message: string; hint?: any; type: string; status: number };
}

export type CallbackEvent<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> =
  | InitialSyncBatch<Schema, Q, UseDates>
  | InitialSyncComplete<Schema, Q, UseDates>
  | SyncTransaction<Schema, Q, UseDates>
  | LoadFromStorage<Schema, Q, UseDates>
  | SetupError<Schema, Q, UseDates>;

export type SyncTableCallback<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
> = (event: CallbackEvent<Schema, Q, UseDates>) => void;

export class SyncTable {
  private trySend: TrySend;
  private subs: PersistedObject<string, Sub, SubInStorage>;
  // Using any for the SyncCallback because we'd need Reactor to be typed
  private callbacks: { [hash: string]: SyncTableCallback<any, any, any>[] } =
    {};
  private config: Config;
  private idToHash: { [subscriptionId: string]: string } = {};
  private log: Logger;
  private createStore: (triples: Triple[]) => any;

  constructor(
    trySend: TrySend,
    storage: StorageInterface,
    config: Config,
    log: Logger,
    createStore: (triples: Triple[]) => any,
  ) {
    this.trySend = trySend;
    this.config = config;
    this.log = log;
    this.createStore = createStore;

    this.subs = new PersistedObject<string, Sub, SubInStorage>(
      storage,
      onMergeSub,
      syncSubToStorage,
      (_key, x) => syncSubFromStorage(x, this.config.useDateObjects),
      (sub) => sub.values?.entities.length || 0,
      log,
      {
        gc: {
          maxAgeMs: 1000 * 60 * 60 * 24 * 7 * 52, // 1 year
          maxEntries: 1000,
          // Size of each sub is the number of entity
          maxSize: 1_000_000, // 1 million entities
        },
      },
    );
  }

  public beforeUnload() {
    this.subs.flush();
  }

  public subscribe(
    q: any,
    cb: SyncTableCallback<any, any, any>,
  ): (
    opts?: { keepSubscription?: boolean | null | undefined } | null | undefined,
  ) => void {
    const hash = weakHash(q);
    this.callbacks[hash] = this.callbacks[hash] || [];
    this.callbacks[hash].push(cb);

    this.initSubscription(q, hash, cb);

    return (opts?: { keepSubscription?: boolean | null | undefined }) => {
      this.unsubscribe(hash, cb, opts?.keepSubscription);
    };
  }

  private unsubscribe(
    hash: string,
    cb: SyncTableCallback<any, any, any>,
    keepSubscription: boolean | null | undefined,
  ) {
    const cbs = (this.callbacks[hash] || []).filter((x) => x !== cb);
    this.callbacks[hash] = cbs;

    if (!cbs.length) {
      delete this.callbacks[hash];
      const sub = this.subs.currentValue[hash];
      if (sub?.state) {
        this.clearSubscriptionData(sub.state.subscriptionId, keepSubscription);
      }
      if (!keepSubscription) {
        this.subs.updateInPlace((prev) => {
          delete prev[hash];
        });
      }
    }
  }

  private sendStart(query: string) {
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
      'tx-id': state.txId,
      token: state.token,
    });
  }

  private sendRemove(state: SubState, keepSubscription: boolean) {
    this.trySend(uuid(), {
      op: 'remove-sync',
      'subscription-id': state.subscriptionId,
      'keep-subscription': keepSubscription,
    });
  }

  private async initSubscription(
    query: any,
    hash: string,
    cb?: SyncTableCallback<any, any, any>,
  ) {
    // Wait for storage to load so that we know if we already have an existing subscription
    await this.subs.waitForKeyToLoad(hash);
    const existingSub = this.subs.currentValue[hash];

    if (existingSub && existingSub.state && existingSub.state.txId) {
      this.sendResync(existingSub, existingSub.state);

      if (existingSub.values?.entities && cb) {
        const k = Object.keys(query)[0];
        cb({
          type: CallbackEventType.LoadFromStorage,
          data: subData(existingSub, existingSub.values?.entities),
        });
      }

      return;
    }

    const table = Object.keys(query)[0];
    const orderBy = query[table]?.$?.order || { serverCreatedAt: 'asc' };
    const [orderField, orderDirection] = Object.entries(orderBy)[0] as [
      string,
      'asc' | 'desc',
    ];

    const orderFieldType =
      orderField === 'serverCreatedAt'
        ? 'number'
        : s.getAttrByFwdIdentName(this.createStore([]), table, orderField)?.[
            'checked-data-type'
          ];

    this.subs.updateInPlace((prev) => {
      prev[hash] = {
        query,
        hash: hash,
        table,
        orderDirection,
        orderField,
        orderFieldType,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    this.sendStart(query);
  }

  public async flushPending() {
    for (const hash of Object.keys(this.callbacks)) {
      await this.subs.waitForKeyToLoad(hash);
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

    this.subs.updateInPlace((prev) => {
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
    });
  }

  private notifyCbs(hash: string, event: CallbackEvent<any, any, any>) {
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
    const sub = this.subs.currentValue[hash];
    if (!sub) {
      this.log.error('Missing sub for hash', hash, msg);
      return;
    }

    const values = sub.values ?? {
      entities: [],
      attrs: this.createStore([]).attrs,
    };
    sub.values = values;
    const entities = values.entities;

    for (const entRows of joinRows) {
      const store = this.createStore(entRows);
      values.attrs = store.attrs;
      const entity = queryEntity(sub, store);
      entities.push({
        store,
        entity,
        serverCreatedAt: getServerCreatedAt(sub, store, entity.id),
      });
      batch.push(entity);
    }

    this.subs.updateInPlace((prev) => {
      prev[hash] = sub;
      // Make sure we write a field or mutative won't
      // see the change because sub === prev[hash]
      prev[hash].updatedAt = Date.now();
    });

    if (sub.values) {
      this.notifyCbs(hash, {
        type: CallbackEventType.InitialSyncBatch,
        data: subData(sub, sub.values.entities),
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
    this.subs.updateInPlace((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return;
      }
      const state = sub.state;
      if (!state) {
        this.log.error('Sub never set init, missing result', sub, msg);
        return prev;
      }
      state.txId = msg['tx-id'];
      sub.updatedAt = Date.now();
    });

    const sub = this.subs.currentValue[hash];

    if (sub) {
      this.notifyCbs(hash, {
        type: CallbackEventType.InitialSyncComplete,
        data: subData(sub, sub.values?.entities || []),
      });
    }
  }

  public onSyncUpdateTriples(msg: SyncUpdateTriplesMsg) {
    const subscriptionId = msg['subscription-id'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }

    const sub = this.subs.currentValue[hash];
    if (!sub) {
      this.log.error('Missing sub for hash', hash, msg);
      return;
    }

    const state = sub.state;
    if (!state) {
      this.log.error('Missing state for sub', sub, msg);
      return;
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

      const values = sub.values ?? {
        entities: [],
        attrs: this.createStore([]).attrs,
      };
      const entities = values.entities;
      sub.values = values;

      const updated: SyncTransaction<any, any, any>['updated'] = [];
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
        values.attrs = store.attrs;
        applyChangesToStore(store, changes);
        const entity = queryEntity(sub, store);
        if (!entity) {
          this.log.error('No entity found after applying change', {
            sub,
            changes,
            store,
          });
          continue;
        }
        entities.push({
          store,
          entity,
          serverCreatedAt: getServerCreatedAt(sub, store, entity.id),
        });
        added.push(entity);
      }

      const removed = [];

      for (const idx of idxesToDelete.sort().reverse()) {
        removed.push(entities[idx].entity);
        entities.splice(idx, 1);
      }

      sortEntitiesInPlace(sub, entities);
      this.notifyCbs(hash, {
        type: CallbackEventType.SyncTransaction,
        data: subData(sub, sub.values?.entities),
        added,
        removed,
        updated,
      });
    }
    this.subs.updateInPlace((prev) => {
      prev[hash] = sub;
      // Make sure we write a field or mutative won't
      // see the change because sub === prev[hash]
      prev[hash].updatedAt = Date.now();
    });
  }

  private clearSubscriptionData(
    subscriptionId: string,
    keepSubscription: boolean,
  ) {
    const hash = this.idToHash[subscriptionId];
    if (hash) {
      delete this.idToHash[subscriptionId];
      const sub = this.subs.currentValue[hash];
      if (sub.state) {
        this.sendRemove(sub.state, keepSubscription);
      }
      if (keepSubscription) {
        this.subs.unloadKey(hash);
      } else {
        this.subs.updateInPlace((prev) => {
          delete prev[hash];
        });
      }
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

    const k = Object.keys(msg['original-event']['q'])[0];
    this.notifyCbs(hash, {
      type: CallbackEventType.Error,
      data: { [k]: [] },
      error,
    });
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
    const removedSub = this.clearSubscriptionData(subscriptionId, false);
    if (removedSub) {
      this.initSubscription(removedSub.query, removedSub.hash);
    }
  }
}
