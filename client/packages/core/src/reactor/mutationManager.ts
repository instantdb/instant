import * as instaml from '../instaml.js';
import * as s from '../store.js';
import uuid from '../utils/uuid.ts';
import { PersistedObject } from '../utils/PersistedObject.js';
import { Deferred } from '../utils/Deferred.js';
import { InstantError } from '../InstantError.ts';
import { InstantAPIError } from '../utils/fetch.ts';
import type { ReactorConfig, MutationErrorDetails } from './types';

const PENDING_TX_CLEANUP_TIMEOUT = 30_000;

const sortedMutationEntries = (entries: Iterable<[string, any]>) => {
  return [...entries].sort((a, b) => {
    const [ka, muta] = a;
    const [kb, mutb] = b;
    const aOrder = muta.order || 0;
    const bOrder = mutb.order || 0;
    if (aOrder === bOrder) {
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }
    return aOrder - bOrder;
  });
};

export interface MutationManagerDeps {
  config: ReactorConfig;
  getAttrs(): Record<string, any> | undefined;
  setAttrs(attrs: any[]): void;
  getQuerySubscriptions(): Record<string, any>;
  notifyQueriesUpdated(): void;
  notifyAttrsSubs(): void;
  isOnline(): boolean;
  isAuthenticated(): boolean;
  send(eventId: string, message: any): void;
}

export interface MutationManagerInitOptions {
  persister: any;
}

export class MutationManager {
  readonly deps: MutationManagerDeps;
  pendingMutations!: PersistedObject;
  private readonly mutationDeferredStore = new Map<string, Deferred<any>>();
  private mutationErrorCbs: Array<(error: MutationErrorDetails) => void> = [];

  constructor(deps: MutationManagerDeps) {
    this.deps = deps;
  }

  initStorage({ persister }: MutationManagerInitOptions) {
    this.pendingMutations = new PersistedObject(
      persister,
      'pendingMutations',
      new Map(),
      this.onMergePendingMutations,
      (x) => JSON.stringify([...x.entries()]),
      (x) => new Map(JSON.parse(x)),
    );
  }

  flush() {
    this.pendingMutations.flush();
  }

  onMergePendingMutations = (storageMuts, inMemoryMuts) => {
    const ret = new Map([...storageMuts.entries(), ...inMemoryMuts.entries()]);
    this.pendingMutations.set(() => ret);
    this.deps.notifyQueriesUpdated();
    const rewrittenStorageMuts = this.rewriteMutations(
      this.deps.getAttrs(),
      storageMuts,
    );
    rewrittenStorageMuts.forEach(([eventId, mut]) => {
      if (!inMemoryMuts.has(eventId) && !mut['tx-id']) {
        this.sendMutation(eventId, mut);
      }
    });
  };

  rewriteMutations(
    attrs: Record<string, any> | undefined,
    muts: Map<string, any>,
    processedTxId?: number,
  ) {
    if (!attrs) return muts;

    const findExistingAttr = (attr) => {
      const [_, etype, label] = attr['forward-identity'];
      return instaml.getAttrByFwdIdentName(attrs, etype, label);
    };
    const findReverseAttr = (attr) => {
      const [_, etype, label] = attr['forward-identity'];
      return instaml.getAttrByReverseIdentName(attrs, etype, label);
    };
    const mapping = { attrIdMap: {}, refSwapAttrIds: new Set<string>() };
    let mappingChanged = false;

    const rewriteTxSteps = (txSteps, txId) => {
      const retTxSteps = [];
      for (const txStep of txSteps) {
        const [action] = txStep;
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
          continue;
        }

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

  rewriteMutationsSorted(
    attrs: Record<string, any> | undefined,
    muts: Map<string, any>,
    processedTxId?: number,
  ) {
    const rewritten = this.rewriteMutations(attrs, muts, processedTxId);
    return sortedMutationEntries(rewritten.entries());
  }

  optimisticAttrs() {
    const baseAttrs = this.deps.getAttrs() || {};
    const pendingMutationSteps = [...this.pendingMutations.currentValue.values()]
      .flatMap((x) => x['tx-steps']);

    const deletedAttrIds = new Set(
      pendingMutationSteps
        .filter(([action]) => action === 'delete-attr')
        .map(([, id]) => id),
    );

    const pendingAttrs = [];
    for (const [action, attr] of pendingMutationSteps) {
      if (action === 'add-attr') {
        pendingAttrs.push(attr);
      } else if (action === 'update-attr' && attr.id && baseAttrs?.[attr.id]) {
        const fullAttr = { ...baseAttrs[attr.id], ...attr };
        pendingAttrs.push(fullAttr);
      }
    }

    const attrsWithoutDeleted = [
      ...Object.values(baseAttrs),
      ...pendingAttrs,
    ].filter((a) => !deletedAttrIds.has(a.id));

    return Object.fromEntries(attrsWithoutDeleted.map((a) => [a.id, a]));
  }

  applyOptimisticUpdates(store, mutations, processedTxId) {
    for (const [, mut] of mutations) {
      if (!mut['tx-id'] || (processedTxId && mut['tx-id'] > processedTxId)) {
        store = s.transact(store, mut['tx-steps']);
      }
    }
    return store;
  }

  enqueueMutation(txSteps, error) {
    const eventId = uuid();
    const values = [...this.pendingMutations.currentValue.values()];
    const order = Math.max(0, ...values.map((mut) => mut.order || 0)) + 1;
    const mutation = {
      op: 'transact',
      'tx-steps': txSteps,
      created: Date.now(),
      error,
      order,
    };
    this.pendingMutations.set((prev) => {
      prev.set(eventId, mutation);
      return prev;
    });

    const dfd = new Deferred();
    this.mutationDeferredStore.set(eventId, dfd);
    this.sendMutation(eventId, mutation);
    this.deps.notifyQueriesUpdated();
    return dfd.promise;
  }

  sendPendingMutations() {
    const mutations = this.rewriteMutationsSorted(
      this.deps.getAttrs(),
      this.pendingMutations.currentValue,
    );
    mutations.forEach(([eventId, mut]) => {
      if (!mut['tx-id']) {
        this.sendMutation(eventId, mut);
      }
    });
  }

  private sendMutation(eventId: string, mutation: any) {
    if (mutation.error) {
      this.handleMutationError('error', eventId, {
        message: mutation.error.message,
      });
      return;
    }
    if (!this.deps.isAuthenticated()) {
      this.finishTransaction('enqueued', eventId);
      return;
    }

    const timeoutMs = Math.max(
      5000,
      this.pendingMutations.currentValue.size * 5000,
    );

    if (!this.deps.isOnline()) {
      this.finishTransaction('enqueued', eventId);
    } else {
      this.deps.send(eventId, mutation);
      setTimeout(() => {
        if (!this.deps.isOnline()) {
          return;
        }
        this.handleMutationError('timeout', eventId, {
          message: 'transaction timed out',
        });
      }, timeoutMs);
    }
  }

  handleMutationError(
    status: 'timeout' | 'error',
    eventId: string,
    errorMsg: { message: string; type?: string; status?: number; hint?: unknown },
  ) {
    const mut = this.pendingMutations.currentValue.get(eventId);
    if (mut && (status !== 'timeout' || !mut['tx-id'])) {
      this.pendingMutations.set((prev) => {
        prev.delete(eventId);
        return prev;
      });
      const errDetails = {
        message: errorMsg.message,
        hint: errorMsg.hint,
      };
      this.deps.notifyQueriesUpdated();
      this.deps.notifyAttrsSubs();
      this.notifyMutationErrorSubs(errDetails);
      this.finishTransaction(status, eventId, errorMsg);
    }
  }

  handleTransactOk(eventId: string, txId: number) {
    const rewrites = this.rewriteMutations(
      this.deps.getAttrs(),
      this.pendingMutations.currentValue,
    );
    const prevMutation = rewrites.get(eventId);
    if (!prevMutation) {
      return;
    }

    this.pendingMutations.set((prev) => {
      prev.set(eventId, {
        ...prev.get(eventId),
        'tx-id': txId,
        confirmed: Date.now(),
      });
      return prev;
    });

    this.cleanupPendingMutationsTimeout();

    const newAttrs = prevMutation['tx-steps']
      .filter(([action]) => action === 'add-attr')
      .map(([, attr]) => attr)
      .concat(Object.values(this.deps.getAttrs() || {}));

    this.deps.setAttrs(newAttrs);
    this.finishTransaction('synced', eventId);
  }

  cleanupPendingMutationsQueries(processedTxId?: number) {
    let minProcessedTxId =
      processedTxId ?? Number.MAX_SAFE_INTEGER;
    if (processedTxId === undefined) {
      const subscriptions = this.deps.getQuerySubscriptions() || {};
      for (const { result } of Object.values(subscriptions)) {
        if (result?.processedTxId) {
          minProcessedTxId = Math.min(minProcessedTxId, result.processedTxId);
        }
      }
    }

    const minTxId = minProcessedTxId;
    this.pendingMutations.set((prev) => {
      for (const [eventId, mut] of Array.from(prev.entries())) {
        if (mut['tx-id'] && mut['tx-id'] <= minTxId) {
          prev.delete(eventId);
        }
      }
      return prev;
    });
  }

  cleanupPendingMutationsTimeout() {
    const now = Date.now();
    if (this.pendingMutations.currentValue.size < 200) {
      return;
    }
    this.pendingMutations.set((prev) => {
      let deleted = false;
      let timeless = false;
      for (const [eventId, mut] of Array.from(prev.entries())) {
        if (!mut.confirmed) {
          timeless = true;
        }
        if (mut.confirmed && mut.confirmed + PENDING_TX_CLEANUP_TIMEOUT < now) {
          prev.delete(eventId);
          deleted = true;
        }
      }
      if (deleted && timeless) {
        for (const [eventId, mut] of Array.from(prev.entries())) {
          if (!mut.confirmed) {
            prev.delete(eventId);
          }
        }
      }
      return prev;
    });
  }

  subscribeMutationErrors(cb: (error: MutationErrorDetails) => void) {
    this.mutationErrorCbs.push(cb);
    return () => {
      this.mutationErrorCbs = this.mutationErrorCbs.filter((x) => x !== cb);
    };
  }

  private notifyMutationErrorSubs(error: MutationErrorDetails) {
    this.mutationErrorCbs.forEach((cb) => cb(error));
  }

  private finishTransaction(
    status: 'enqueued' | 'pending' | 'synced' | 'timeout' | 'error',
    eventId: string,
    errorMsg?: { message?: string; type?: string; status?: number; hint?: unknown },
  ) {
    const dfd = this.mutationDeferredStore.get(eventId);
    this.mutationDeferredStore.delete(eventId);
    const ok = status !== 'error' && status !== 'timeout';

    if (!dfd && !ok) {
      console.error('Mutation failed', { status, eventId, ...errorMsg });
    }
    if (!dfd) {
      return;
    }
    if (ok) {
      dfd.resolve({ status, eventId });
    } else {
      if (errorMsg?.type) {
        const { status: httpStatus, ...body } = errorMsg;
        dfd.reject(
          new InstantAPIError({
            body,
            status: httpStatus,
          }),
        );
      } else {
        dfd.reject(new InstantError(errorMsg?.message, errorMsg?.hint));
      }
    }
  }
}
