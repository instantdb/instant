import { PersistedObject } from './utils/PersistedObject.ts';
import * as s from './store.ts';
import weakHash from './utils/weakHash.ts';
import uuid from './utils/id.ts';
import { Logger } from './Reactor.js';
import instaql, { compareOrder } from './instaql.ts';
import { InstaQLResponse, ValidQuery } from './queryTypes.ts';
import { EntitiesDef, IContainEntitiesAndLinks } from './schemaTypes.ts';
import { StorageInterface } from './index.ts';

type SubState = {
  txId?: number;
  subscriptionId: string;
  token: string;
};

type SubEntity = {
  entity: any;
  store: s.Store;
  serverCreatedAt: number;
};

type SubValues = {
  attrsStore: s.AttrsStore;
  entities: Array<SubEntity>;
};

type Sub = {
  query: any;
  hash: string;
  table: string;
  orderField: string;
  orderDirection: 'asc' | 'desc';
  orderFieldType?: 'string' | 'number' | 'date' | 'boolean' | null;
  state?: SubState;
  values?: SubValues;
  createdAt: number;
  updatedAt: number;
};

type SubEntityInStorage = {
  entity: any;
  store: s.StoreJson;
  serverCreatedAt: number;
};

type SubValuesInStorage = {
  attrsStore: s.AttrsStoreJson;
  entities: Array<SubEntityInStorage>;
};

// We could make a better type for this if we had a return type for s.toJSON
type SubInStorage = Omit<Sub, 'values'> & {
  values: SubValuesInStorage;
};

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
    const attrsStore = s.attrsStoreFromJSON(values.attrsStore, null);
    if (attrsStore) {
      for (const e of values.entities || []) {
        e.store.useDateObjects = useDateObjects;
        (e as unknown as SubEntity).store = s.fromJSON(attrsStore, e.store);
      }
      (values as unknown as SubValues).attrsStore = attrsStore;
    }
  }

  return sub as unknown as Sub;
}

function syncSubToStorage(_k: string, sub: Sub): SubInStorage {
  if (sub.values) {
    const entities: SubEntityInStorage[] = [];
    for (const e of sub.values?.entities) {
      const store = s.toJSON(e.store);
      entities.push({ ...e, store });
    }
    return {
      ...sub,
      values: { attrsStore: sub.values.attrsStore.toJSON(), entities },
    };
  } else {
    return sub as unknown as SubInStorage;
  }
}

function onMergeSub(
  _key: string,
  storageSub: Sub,
  inMemorySub: Sub | null,
): Sub {
  const storageTxId = storageSub?.state?.txId;
  const memoryTxId = inMemorySub?.state?.txId;

  if (storageTxId && (!memoryTxId || storageTxId > memoryTxId)) {
    return storageSub;
  }

  if (memoryTxId && (!storageTxId || memoryTxId > storageTxId)) {
    return inMemorySub;
  }

  return storageSub || inMemorySub;
}

function queryEntity(sub: Sub, store: s.Store, attrsStore: s.AttrsStore) {
  const res = instaql(
    { store, attrsStore, pageInfo: null, aggregate: null },
    sub.query,
  );
  return res.data[sub.table][0];
}

function getServerCreatedAt(
  sub: Sub,
  store: s.Store,
  attrsStore: s.AttrsStore,
  entityId: string,
): number {
  const aid = s.getAttrByFwdIdentName(attrsStore, sub.table, 'id')?.id;
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
  store: s.Store,
  attrsStore: s.AttrsStore,
  changes: SyncUpdateTriplesMsg['txes'][number]['changes'],
): void {
  for (const { action, triple } of changes) {
    switch (action) {
      case 'added':
        s.addTriple(store, attrsStore, triple);
        break;
      case 'removed':
        s.retractTriple(store, attrsStore, triple);
        break;
    }
  }
}

type ChangedFieldsOfChanges = {
  [eid: string]: { [field: string]: { oldValue: unknown; newValue: unknown } };
};

function changedFieldsOfChanges(
  store: s.Store,
  attrsStore: s.AttrsStore,
  changes: SyncUpdateTriplesMsg['txes'][number]['changes'],
): ChangedFieldsOfChanges {
  // This will be more complicated when we include links, we can either add a
  // changedLinks field or we can have something like 'bookshelves.title`
  const changedFields: ChangedFieldsOfChanges = {};
  for (const { action, triple } of changes) {
    const [e, a, v] = triple;
    const field = attrsStore.getAttr(a)?.['forward-identity']?.[2];
    if (!field) continue;

    const fields = changedFields[e] ?? {};
    changedFields[e] = fields;

    const oldNew = fields[field] ?? {};

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

    fields[field] = oldNew;
  }

  for (const [_eid, fields] of Object.entries(changedFields)) {
    for (const [k, { oldValue, newValue }] of Object.entries(fields)) {
      if (oldValue === newValue) {
        delete fields[k];
      }
    }
  }
  return changedFields;
}

function subData(sub: Sub, entities: NonNullable<Sub['values']>['entities']) {
  return { [sub.table]: entities.map((e) => e.entity) };
}

type CreateStore = (triples: Triple[]) => s.Store;

// Updates the sub order field type if it hasn't been set
// and returns the type. We have to wait until the attrs
// are loaded before we can determine the type.
function orderFieldTypeMutative(sub: Sub, getAttrs: () => s.AttrsStore) {
  if (sub.orderFieldType) {
    return sub.orderFieldType;
  }
  const orderFieldType =
    sub.orderField === 'serverCreatedAt'
      ? 'number'
      : s.getAttrByFwdIdentName(getAttrs(), sub.table, sub.orderField)?.[
          'checked-data-type'
        ];

  sub.orderFieldType = orderFieldType;
  return orderFieldType;
}

function sortEntitiesInPlace(
  sub: Sub,
  orderFieldType: NonNullable<Sub['orderFieldType']>,
  entities: NonNullable<Sub['values']>['entities'],
) {
  const dataType = orderFieldType;
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
  private createStore: CreateStore;
  private getAttrs: () => s.AttrsStore;

  constructor(
    trySend: TrySend,
    storage: StorageInterface,
    config: Config,
    log: Logger,
    createStore: CreateStore,
    getAttrs: () => s.AttrsStore,
  ) {
    this.trySend = trySend;
    this.config = config;
    this.log = log;
    this.createStore = createStore;
    this.getAttrs = getAttrs;

    this.subs = new PersistedObject<string, Sub, SubInStorage>({
      persister: storage,
      merge: onMergeSub,
      serialize: syncSubToStorage,
      parse: (_key, x) => syncSubFromStorage(x, this.config.useDateObjects),
      objectSize: (sub) => sub.values?.entities.length || 0,
      logger: log,
      gc: {
        maxAgeMs: 1000 * 60 * 60 * 24 * 7 * 52, // 1 year
        maxEntries: 1000,
        // Size of each sub is the number of entity
        maxSize: 1_000_000, // 1 million entities
      },
    });
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
        this.clearSubscriptionData(
          sub.state.subscriptionId,
          !!keepSubscription,
        );
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

  private sendResync(sub: Sub, state: SubState, txId: number) {
    // Make sure we can find the hash from the subscriptionId
    this.idToHash[state.subscriptionId] = sub.hash;
    this.trySend(state.subscriptionId, {
      op: 'resync-table',
      'subscription-id': state.subscriptionId,
      'tx-id': txId,
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
      this.sendResync(existingSub, existingSub.state, existingSub.state.txId);

      if (existingSub.values?.entities && cb) {
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

    this.subs.updateInPlace((prev) => {
      prev[hash] = {
        query,
        hash: hash,
        table,
        orderDirection,
        orderField,
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

    const batch: any[] = [];
    const sub = this.subs.currentValue[hash];
    if (!sub) {
      this.log.error('Missing sub for hash', hash, msg);
      return;
    }

    const values: SubValues = sub.values ?? {
      entities: [],
      attrsStore: this.getAttrs(),
    };
    sub.values = values;
    const entities = values.entities;

    for (const entRows of joinRows) {
      const store = this.createStore(entRows);
      const entity = queryEntity(sub, store, values.attrsStore);
      entities.push({
        store,
        entity,
        serverCreatedAt: getServerCreatedAt(
          sub,
          store,
          values.attrsStore,
          entity.id,
        ),
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
      if (state.txId && state.txId >= tx['tx-id']) {
        continue;
      }
      state.txId = tx['tx-id'];
      const idxesToDelete: number[] = [];
      // Note: this won't work as well when links are involved
      const byEid: {
        [eid: string]: SyncUpdateTriplesMsg['txes'][number]['changes'];
      } = {};
      for (const change of tx.changes) {
        const eidChanges = byEid[change.triple[0]] ?? [];
        byEid[change.triple[0]] = eidChanges;
        eidChanges.push(change);
      }

      const values: SubValues = sub.values ?? {
        entities: [],
        attrsStore: this.getAttrs(),
      };
      const entities = values.entities;
      sub.values = values;

      const updated: SyncTransaction<any, any, any>['updated'] = [];
      // Update the existing stores, if we already know about this entity
      eidLoop: for (const [eid, changes] of Object.entries(byEid)) {
        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          if (s.hasEntity(ent.store, eid)) {
            applyChangesToStore(ent.store, values.attrsStore, changes);
            const entity = queryEntity(sub, ent.store, values.attrsStore);
            const changedFields = changedFieldsOfChanges(
              ent.store,
              values.attrsStore,
              changes,
            )[eid];
            if (entity) {
              updated.push({
                oldEntity: ent.entity,
                newEntity: entity,
                changedFields: (changedFields || {}) as SyncTransaction<
                  any,
                  any,
                  any
                >['updated'][number]['changedFields'],
              });
              ent.entity = entity;
            } else {
              idxesToDelete.push(i);
            }
            delete byEid[eid];
            continue eidLoop;
          }
        }
      }

      const added: any[] = [];
      // If we have anything left in byEid, then this must be a new entity we don't know about
      for (const [_eid, changes] of Object.entries(byEid)) {
        const store = this.createStore([]);
        applyChangesToStore(store, values.attrsStore, changes);
        const entity = queryEntity(sub, store, values.attrsStore);
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
          serverCreatedAt: getServerCreatedAt(
            sub,
            store,
            values.attrsStore,
            entity.id,
          ),
        });
        added.push(entity);
      }

      const removed: any[] = [];

      for (const idx of idxesToDelete.sort().reverse()) {
        removed.push(entities[idx].entity);
        entities.splice(idx, 1);
      }

      const orderFieldType = orderFieldTypeMutative(sub, this.getAttrs);

      sortEntitiesInPlace(sub, orderFieldType!, entities);
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
