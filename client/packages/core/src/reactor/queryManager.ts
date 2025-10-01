import instaql from '../instaql.js';
import * as s from '../store.js';
import weakHash from '../utils/weakHash.ts';
import uuid from '../utils/uuid.ts';
import { PersistedObject } from '../utils/PersistedObject.js';
import { createQueryActor, type QueryActorAPI } from './queryActor.ts';
import { extractTriples } from '../model/instaqlResult.js';
import { areObjectsDeepEqual } from '../utils/object.js';
import type { ReactorConfig } from './types';
import type { LinkIndex } from '../utils/linkIndex.ts';
import type { PersistedMutationStore } from './mutationTypes';

interface QueryCacheEntry {
  querySubVersion: number;
  pendingMutationsVersion: number;
  data: any;
}

export interface QueryManagerDeps {
  config: ReactorConfig;
  queryCacheLimit: number;
  getError(): { message: string } | null;
  getPendingMutations(): PersistedMutationStore;
  rewriteMutationsSorted(
    attrs: Record<string, any> | undefined,
    muts: Map<string, any>,
    processedTxId?: number,
  ): Array<[string, any]>;
  applyOptimisticUpdates(
    store: any,
    mutations: Array<[string, any]>,
    processedTxId?: number,
  ): any;
  enableCardinalityInference(): boolean;
  getLinkIndex(): LinkIndex | null;
  getAttrs(): Record<string, any> | undefined;
  sendAddQuery(eventId: string, message: { op: 'add-query'; q: any }): void;
  sendRemoveQuery(eventId: string, message: { op: 'remove-query'; q: any }): void;
  notifyQueriesChanged(): void;
}

export interface QueryManagerInitOptions {
  persister: any;
}

export class QueryManager {
  readonly queryRegistry: QueryActorAPI;
  readonly config: ReactorConfig;
  readonly queryCacheLimit: number;
  querySubs!: PersistedObject;
  private readonly getError: QueryManagerDeps['getError'];
  private readonly getPendingMutations: QueryManagerDeps['getPendingMutations'];
  private readonly rewriteMutationsSorted: QueryManagerDeps['rewriteMutationsSorted'];
  private readonly applyOptimisticUpdates: QueryManagerDeps['applyOptimisticUpdates'];
  private readonly enableCardinalityInference: QueryManagerDeps['enableCardinalityInference'];
  private readonly getLinkIndex: QueryManagerDeps['getLinkIndex'];
  private readonly getAttrs: QueryManagerDeps['getAttrs'];
  private readonly sendAddQuery: QueryManagerDeps['sendAddQuery'];
  private readonly sendRemoveQuery: QueryManagerDeps['sendRemoveQuery'];
  private readonly notifyQueriesChanged: QueryManagerDeps['notifyQueriesChanged'];
  private dataCache: Map<string, QueryCacheEntry> = new Map();

  constructor(deps: QueryManagerDeps) {
    this.queryRegistry = createQueryActor();
    this.config = deps.config;
    this.queryCacheLimit = deps.queryCacheLimit;
    this.getError = deps.getError;
    this.getPendingMutations = deps.getPendingMutations;
    this.rewriteMutationsSorted = deps.rewriteMutationsSorted;
    this.applyOptimisticUpdates = deps.applyOptimisticUpdates;
    this.enableCardinalityInference = deps.enableCardinalityInference;
    this.getLinkIndex = deps.getLinkIndex;
    this.getAttrs = deps.getAttrs;
    this.sendAddQuery = deps.sendAddQuery;
    this.sendRemoveQuery = deps.sendRemoveQuery;
    this.notifyQueriesChanged = deps.notifyQueriesChanged;
  }

  initStorage({ persister }: QueryManagerInitOptions) {
    const onMerge = (storageSubs, inMemorySubs) => {
      const storage = storageSubs || {};
      const merged = { ...inMemorySubs };

      Object.entries(inMemorySubs).forEach(([hash, sub]) => {
        const storageResult = storage?.[hash]?.result;
        if (storageResult && !sub.result) {
          merged[hash].result = storageResult;
        }
      });

      const storageKsToAdd = Object.keys(storage)
        .filter((k) => !inMemorySubs[k])
        .sort((a, b) => {
          const aTime = storage[a]?.lastAccessed || 0;
          const bTime = storage[b]?.lastAccessed || 0;
          return bTime - aTime;
        })
        .slice(0, this.queryCacheLimit);

      storageKsToAdd.forEach((k) => {
        merged[k] = storage[k];
      });

      this.querySubs.set((_) => merged);
      this.notifyQueriesChanged();
    };

    this.querySubs = new PersistedObject(
      persister,
      'querySubs',
      {},
      onMerge,
      (querySubs) => {
        const jsonSubs = {};
        for (const key in querySubs) {
          const sub = querySubs[key];
          const jsonSub = { ...sub };
          if (sub.result?.store) {
            jsonSub.result = {
              ...sub.result,
              store: s.toJSON(sub.result.store),
            };
          }
          jsonSubs[key] = jsonSub;
        }
        return JSON.stringify(jsonSubs);
      },
      (str) => {
        if (!str) return {};
        const parsed = JSON.parse(str);
        for (const key in parsed) {
          const v = parsed[key];
          if (v?.result?.store) {
            const storeJSON = v.result.store;
            v.result.store = s.fromJSON({
              ...storeJSON,
              useDateObjects: this.config.useDateObjects,
            });
          }
        }
        return parsed;
      },
    );
  }

  subscribeQuery(q: any, cb: (data: any) => void) {
    const hash = weakHash(q);
    const prevResult = this.getPreviousResult(q);
    if (prevResult) {
      cb(prevResult);
    }

    const listenerPromise = this.queryRegistry.addListener(hash, { q, cb });

    listenerPromise.then(() => {
      const data = this.dataForQuery(hash);
      if (data && data !== prevResult) {
        cb(data);
      }
    });

    this.startQuerySub(q, hash);

    return () => {
      void this.unsubQuery(q, hash, cb);
    };
  }

  startQuerySub(q: any, hash: string) {
    const eventId = this.querySubs.currentValue[hash]?.eventId || uuid();
    this.querySubs.set((prev) => {
      const next = { ...prev };
      next[hash] = next[hash] || { q, result: null, eventId };
      next[hash].lastAccessed = Date.now();
      return next;
    });
    this.sendAddQuery(eventId, { op: 'add-query', q });
    return eventId;
  }

  async unsubQuery(q: any, hash: string, cb: (data: any) => void) {
    const { remaining, once } = await this.queryRegistry.removeListener(hash, cb);
    if (remaining === 0 && once === 0) {
      this.cleanupQuery(q, hash);
    }
  }

  queryOnce(q: any, dfd: any, eventId: string) {
    const hash = weakHash(q);
    void this.queryRegistry.addOnce(hash, { q, dfd, eventId });
  }

  async completeQueryOnce(q: any, hash: string, dfd: any) {
    await this.queryRegistry.resolveOnce(hash, dfd);
    this.cleanupQuery(q, hash);
  }

  async rejectQueryOnce(q: any, hash: string, eventId: string, error: any) {
    const onceRecords = this.queryRegistry.getOnce(hash).filter((r) => r.eventId === eventId);
    onceRecords.forEach((record) => record.dfd.reject(error));
    await this.queryRegistry.rejectOnce(hash, eventId);
    this.cleanupQuery(q, hash);
  }

  cleanupQuery(q: any, hash: string) {
    const hasListeners =
      this.queryRegistry.hasListeners(hash) || this.queryRegistry.hasOnce(hash);

    if (hasListeners) return;

    void this.queryRegistry.clear(hash);
    this.sendRemoveQuery(uuid(), { op: 'remove-query', q });
  }

  dataForQuery(hash: string) {
    const errorMessage = this.getError();
    if (errorMessage) {
      return { error: errorMessage };
    }
    if (!this.querySubs) return;
    const querySubVersion = this.querySubs.version();
    const querySubs = this.querySubs.currentValue;
    const pendingMutations = this.getPendingMutations();
    const pendingMutationsVersion = pendingMutations.version();

    const { q, result } = querySubs[hash] || {};
    if (!result) return;

    const cached = this.dataCache.get(hash);
    if (
      cached &&
      querySubVersion === cached.querySubVersion &&
      pendingMutationsVersion === cached.pendingMutationsVersion
    ) {
      return cached.data;
    }

    const { store, pageInfo, aggregate, processedTxId } = result;
    const mutations = this.rewriteMutationsSorted(
      store.attrs,
      pendingMutations.currentValue,
      processedTxId,
    );
    const newStore = this.applyOptimisticUpdates(store, mutations, processedTxId);
    const data = instaql({ store: newStore, pageInfo, aggregate }, q);

    this.dataCache.set(hash, {
      data,
      querySubVersion,
      pendingMutationsVersion,
    });

    return data;
  }

  clearCache() {
    this.dataCache.clear();
  }

  getPreviousResult(q: any) {
    const hash = weakHash(q);
    return this.dataForQuery(hash);
  }

  notifyOne(hash: string) {
    const cbs = this.queryRegistry.getCallbacks(hash);
    const prevData = this.dataCache.get(hash)?.data;
    const data = this.dataForQuery(hash);

    if (!data) return;
    if (prevData && areObjectsDeepEqual(prevData, data)) {
      return;
    }

    cbs.forEach((record) => record.cb(data));
  }

  notifyAll() {
    this.queryRegistry.hashesWithListeners().forEach((hash) => {
      this.notifyOne(hash);
    });
  }

  notifyQueryError(hash: string, error: any) {
    const cbs = this.queryRegistry.getCallbacks(hash);
    cbs.forEach((record) => record.cb({ error }));
  }

  notifyOneQueryOnce(hash: string) {
    const dfds = this.queryRegistry.getOnce(hash);
    const data = this.dataForQuery(hash);
    dfds.forEach((record) => {
      void this.completeQueryOnce(record.q, hash, record.dfd);
      record.dfd.resolve(data);
    });
  }

  notifyQueryOnceError(q: any, hash: string, eventId: string, error: any) {
    void this.rejectQueryOnce(q, hash, eventId, error);
  }

  loadedNotifyAll(pendingMutations: PersistedMutationStore) {
    if (pendingMutations.isLoading() || this.querySubs.isLoading()) {
      return;
    }
    this.notifyAll();
  }

  flushPendingMessages(send: (eventId: string, payload: any) => void) {
    const subs = this.queryRegistry.hashesWithListeners().map((hash) => {
      return this.querySubs.currentValue[hash];
    });
    const safeSubs = subs.filter(Boolean);
    safeSubs.forEach(({ eventId, q }) => {
      send(eventId, { op: 'add-query', q });
    });

    this.queryRegistry.hashesWithOnce().forEach((hash) => {
      this.queryRegistry.getOnce(hash).forEach(({ eventId, q }) => {
        send(eventId, { op: 'add-query', q });
      });
    });
  }

  handleAddQueryOk(msg: any, opts: { processedTxId: number }) {
    const { q, result } = msg;
    const hash = weakHash(q);
    const pageInfo = result?.[0]?.data?.['page-info'];
    const aggregate = result?.[0]?.data?.['aggregate'];
    const triples = extractTriples(result);
    const store = s.createStore(
      this.getAttrs(),
      triples,
      this.enableCardinalityInference(),
      this.getLinkIndex(),
      this.config.useDateObjects,
    );
    this.querySubs.set((prev) => {
      prev[hash].result = {
        store,
        pageInfo,
        aggregate,
        processedTxId: opts.processedTxId,
      };
      return prev;
    });
    this.notifyQueriesChanged();
    this.notifyOne(hash);
    this.notifyOneQueryOnce(hash);
  }

  handleRefreshOk(msg: any, mutations: Array<[string, any]>) {
    const { computations, 'processed-tx-id': processedTxId } = msg;

    const updates = computations.map((x) => {
      const q = x['instaql-query'];
      const result = x['instaql-result'];
      const hash = weakHash(q);
      const triples = extractTriples(result);
      const store = s.createStore(
        this.getAttrs(),
        triples,
        this.enableCardinalityInference(),
        this.getLinkIndex(),
        this.config.useDateObjects,
      );
      const newStore = this.applyOptimisticUpdates(store, mutations, processedTxId);
      const pageInfo = result?.[0]?.data?.['page-info'];
      const aggregate = result?.[0]?.data?.['aggregate'];
      return { hash, store: newStore, pageInfo, aggregate, processedTxId };
    });

    updates.forEach(({ hash, store, pageInfo, aggregate, processedTxId: txId }) => {
      this.querySubs.set((prev) => {
        prev[hash].result = { store, pageInfo, aggregate, processedTxId: txId };
        return prev;
      });
    });

    updates.forEach(({ hash }) => {
      this.notifyOne(hash);
    });
  }
}
