// PersistedObjects save data outside of memory.
//
// When we load a persisted object, it's possible we call `set`
// before we finish loading. To address we handle set in two ways:
//
// 1. Before load
// We simply update currentValue in memory
//
// 2. After load
// We update currentValue in memory and in storage
//
// Each PersistedObject provides it's own `onMerge`
// function to handle the merge of data from storage and memory
// on load

// Uses `requestIdleCallback` if available, otherwise calls the
// callback immediately

import { create } from 'mutative';
import type { Logger } from './log.ts';

function safeIdleCallback(cb, timeout: number) {
  if (typeof requestIdleCallback === 'undefined') {
    cb();
  } else {
    requestIdleCallback(cb, { timeout });
  }
}

export const META_KEY = '__meta';

export type ObjectMeta = { createdAt: number; updatedAt: number; size: number };

export type Meta<K extends string> = {
  objects: Record<K, ObjectMeta>;
};

export type StorageInterfaceStoreName = 'kv' | 'querySubs' | 'syncSubs';

export abstract class StorageInterface {
  constructor(appId: string, storeName: StorageInterfaceStoreName) {}
  abstract getItem(key: string): Promise<any>;
  abstract removeItem(key: string): Promise<void>;
  abstract multiSet(keyValuePairs: Array<[string, any]>): Promise<void>;
  abstract getAllKeys(): Promise<string[]>;
}

export type GCOpts = {
  maxSize: number;
  maxAgeMs: number;
  maxEntries: number;
};

export type Opts<K, T, SerializedT> = {
  persister: StorageInterface;
  /**
   * Merges data from storage with in-memory value on load.
   * The value returned from merge will become the current value.
   */
  merge: (
    key: K,
    fromStorage: T | null | undefined,
    inMemoryValue: T | null | undefined,
  ) => T;
  serialize: (key: K, input: T) => SerializedT;
  parse: (key: K, value: SerializedT) => T;
  objectSize: (x: SerializedT) => number;
  logger: Logger;
  gc: GCOpts | null | undefined;
  saveThrottleMs?: number | null | undefined;
  idleCallbackMaxWaitMs?: number | null | undefined;
  preloadEntryCount?: number | null | undefined;
};

export class PersistedObject<K extends string, T, SerializedT> {
  currentValue: Record<K, T>;
  private _subs: ((value: Record<K, T>) => void)[] = [];
  private _persister: StorageInterface;
  private _merge: (key: K, fromStorage: T, inMemoryValue: T) => T;
  private serialize: (key: K, input: T) => SerializedT;
  private parse: (key: K, value: SerializedT) => T;
  private _saveThrottleMs: number;
  private _idleCallbackMaxWaitMs: number;
  private _nextSave: null | NodeJS.Timeout = null;
  private _nextGc: null | NodeJS.Timeout = null;
  private _pendingSaveKeys: Set<K> = new Set();
  private _loadedKeys: Set<K> = new Set();
  private _loadingKeys: Record<K, Promise<T>>;
  private _objectSize: (serializedObject: SerializedT) => number;
  private _log: Logger;

  onKeyLoaded: (key: string) => void | null | undefined;
  private _version = 0;
  private _meta: {
    isLoading: boolean;
    onLoadCbs: Array<() => void>;
    value: null | Meta<K>;
    error: null | Error;
    attempts: number;
    loadingPromise?: Promise<Meta<K>> | null | undefined;
  } = {
    isLoading: true,
    onLoadCbs: [],
    value: null,
    error: null,
    attempts: 0,
  };
  private _gcOpts: GCOpts | null | undefined;

  constructor(opts: Opts<K, T, SerializedT>) {
    this._persister = opts.persister;
    this._merge = opts.merge;
    this.serialize = opts.serialize;
    this.parse = opts.parse;
    this._objectSize = opts.objectSize;
    this._log = opts.logger;
    this._saveThrottleMs = opts.saveThrottleMs ?? 100;
    this._idleCallbackMaxWaitMs = opts.idleCallbackMaxWaitMs ?? 1000;
    this._gcOpts = opts.gc;
    this.currentValue = {} as Record<K, T>;
    this._loadedKeys = new Set();
    this._loadingKeys = {} as Record<K, Promise<T>>;
    this._initMeta();
    if (opts.preloadEntryCount) {
      this._preloadEntries(opts.preloadEntryCount);
    }
  }

  private async _initMeta() {
    if (this._meta.loadingPromise) {
      await this._meta.loadingPromise;
    }
    try {
      const p = this._persister.getItem(META_KEY);
      this._meta.loadingPromise = p;
      const v = await p;
      this._meta.isLoading = false;
      this._meta.error = null;
      this._meta.loadingPromise = null;
      this._meta.attempts = 0;
      const existingObjects = this._meta.value?.objects ?? {};
      const value = v ?? {};
      const objects = value.objects ?? {};
      // Merge the values from storage with in-memory values
      this._meta.value = {
        ...value,
        objects: { ...existingObjects, ...objects },
      } as Meta<K>;
    } catch (e) {
      this._meta.error = e;
      this._meta.attempts++;
      this._meta.loadingPromise = null;
    }
  }

  private async _getMeta(): Promise<Meta<K> | null> {
    if (this._meta.value) {
      return this._meta.value;
    }
    if (this._meta.loadingPromise) {
      await this._meta.loadingPromise;
      return this._meta.value;
    }
    this._initMeta();
    await this._meta.loadingPromise;
    return this._meta.value;
  }

  private async _refreshMeta(): Promise<Meta<K> | null> {
    await this._initMeta();
    return this._meta.value;
  }

  private async _preloadEntries(n: number) {
    const meta = await this.waitForMetaToLoad();
    if (!meta) return;
    const entries = Object.entries(meta.objects) as Array<[K, ObjectMeta]>;
    entries.sort(([_k_a, a_meta], [_k_b, b_meta]) => {
      return b_meta.updatedAt - a_meta.updatedAt;
    });
    for (const [k] of entries.slice(0, n)) {
      this._loadKey(k);
    }
  }

  private async _getFromStorage(key: K) {
    try {
      const data = await this._persister.getItem(key);
      if (!data) {
        return data;
      }
      const parsed = this.parse(key, data as SerializedT);
      return parsed;
    } catch (e) {
      console.error(`Unable to read from storage for key=${key}`, e);
      return null;
    }
  }

  public async waitForKeyToLoad(k: K) {
    if (this._loadedKeys.has(k)) {
      return this.currentValue[k];
    }
    await (this._loadingKeys[k] || this._loadKey(k));
    return this.currentValue[k];
  }

  // Used for tests
  public async waitForMetaToLoad() {
    return this._getMeta();
  }

  // Unloads the key so that it can be garbage collected, but does not
  // delete it. Removes the key from currentValue.
  public unloadKey(k: K) {
    this._loadedKeys.delete(k);
    delete this._loadingKeys[k];
    delete this.currentValue[k];
  }

  private async _loadKey(k: K) {
    if (this._loadedKeys.has(k) || k in this._loadingKeys) return;
    const p = this._getFromStorage(k);
    this._loadingKeys[k] = p;
    const value = await p;
    delete this._loadingKeys[k];
    this._loadedKeys.add(k);

    if (value) {
      const merged = this._merge(k, value, this.currentValue[k]);
      if (merged) {
        this.currentValue[k] = merged;
      }
    }
    this.onKeyLoaded && this.onKeyLoaded(k);
  }

  // Returns a promise with a number so that we can wait for flush
  // to finish in the tests. The number is the number of operations
  // it performed, but it's mostly there so that typescript will warn
  // us if we forget to retun the promise from the function.
  private _writeToStorage(opts?: {
    skipGc?: boolean | null | undefined;
    attempts?: number | null | undefined;
  }): Promise<number> {
    const promises: Promise<number>[] = [];
    const skipGc = opts?.skipGc;
    if (this._meta.isLoading) {
      // Wait for meta to load and try again, give it a delay so that
      // we don't spend too much time retrying
      const p: Promise<number> = new Promise((resolve, reject) => {
        setTimeout(
          () =>
            this._enqueuePersist(
              opts
                ? { ...opts, attempts: (opts.attempts || 0) + 1 }
                : { attempts: 1 },
            )
              .then(resolve)
              .catch(reject),
          10 + (opts?.attempts ?? 0) * 1000,
        );
      });
      promises.push(p);
      return Promise.all(promises).then((vs) =>
        vs.reduce((acc, x) => acc + x, 0),
      );
    }
    const metaValue = this._meta.value;
    if (!metaValue) {
      // If it's not loading and we don't have the data, then there
      // must be an error and we're not going to be able to save until
      // the error is resolved elsewhere.
      return Promise.resolve(0);
    }
    const keysToDelete: K[] = [];
    const keysToUpdate: K[] = [];
    for (const k of this._pendingSaveKeys) {
      if (!(k in this.currentValue)) {
        keysToDelete.push(k);
        delete metaValue.objects[k];
      } else {
        keysToUpdate.push(k);
      }
    }

    for (const k of keysToDelete) {
      const p = this._persister.removeItem(k);
      promises.push(p.then(() => 1));
      this._loadedKeys.delete(k);
      this._pendingSaveKeys.delete(k);
    }

    const keysToLoad: K[] = [];

    const kvPairs: Array<[string, any]> = [[META_KEY, metaValue]];
    const metaObjects: Meta<K>['objects'] =
      metaValue.objects ?? ({} as Meta<K>['objects']);
    metaValue.objects = metaObjects;
    for (const k of keysToUpdate) {
      if (this._loadedKeys.has(k)) {
        const serializedV = this.serialize(k, this.currentValue[k]);
        kvPairs.push([k, serializedV]);
        const size = this._objectSize(serializedV);
        const m = metaObjects[k] ?? {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          size,
        };
        m.updatedAt = Date.now();
        m.size = size;
        metaObjects[k] = m;
        this._pendingSaveKeys.delete(k);
      } else {
        keysToLoad.push(k);
      }
    }

    const p = this._persister.multiSet(kvPairs);
    promises.push(p.then(() => 1));

    // For the keys that haven't loaded, load the key then try
    // persisting again. We don't want to do any async work here
    // or else we might end up saving older copies of the data to
    // the store.
    for (const k of keysToLoad) {
      const p = this._loadKey(k).then(() => this._enqueuePersist(opts));
      promises.push(p);
    }

    if (!skipGc) {
      this.gc();
    }

    return Promise.all(promises).then((vs) => {
      return vs.reduce((acc, x) => acc + x, 0);
    });
  }

  async flush() {
    if (!this._nextSave) {
      return;
    }
    clearTimeout(this._nextSave);
    this._nextSave = null;
    const p = this._writeToStorage();
    return p;
  }

  private async _gc() {
    if (!this._gcOpts) {
      return;
    }
    const keys = new Set(await this._persister.getAllKeys());
    keys.delete(META_KEY);

    // Keys we can't delete
    const sacredKeys = new Set(Object.keys(this.currentValue));
    for (const k of Object.keys(this._loadingKeys)) {
      sacredKeys.add(k);
    }
    for (const k of this._loadedKeys) {
      sacredKeys.add(k);
    }

    // Refresh meta from the store so that we're less likely to
    // clobber data from other tabs
    const meta = await this._refreshMeta();
    if (!meta) {
      this._log.info('Could not gc because we were not able to load meta');
      return;
    }

    const promises: Promise<any>[] = [];

    const deets = {
      gcOpts: this._gcOpts,
      keys,
      sacredKeys,
      removed: [] as string[],
      metaRemoved: [],
      removedMissingCount: 0,
      removedOldCount: 0,
      removedThresholdCount: 0,
      removedSizeCount: 0,
    };

    // First, remove all keys we don't know about
    for (const key of keys) {
      if (sacredKeys.has(key) || key in meta.objects) {
        continue;
      }
      this._log.info('Lost track of key in meta', key);
      promises.push(this._persister.removeItem(key));
      deets.removed.push(key);
      deets.removedMissingCount++;
    }

    // Remove anything over the max age
    const now = Date.now();
    for (const [k, m] of Object.entries(meta.objects)) {
      if (
        !sacredKeys.has(k) &&
        (m as ObjectMeta).updatedAt < now - this._gcOpts.maxAgeMs
      ) {
        promises.push(this._persister.removeItem(k));
        delete meta.objects[k];
        deets.removed.push(k);
        deets.removedOldCount++;
      }
    }

    // Keep queries under max queries
    const maxEntries = Object.entries(meta.objects) as Array<[K, ObjectMeta]>;
    maxEntries.sort(([_k_a, a_meta], [_k_b, b_meta]) => {
      return a_meta.updatedAt - b_meta.updatedAt;
    });

    const deletableMaxEntries = maxEntries.filter(([x]) => !sacredKeys.has(x));
    if (maxEntries.length > this._gcOpts.maxEntries) {
      for (const [k] of deletableMaxEntries.slice(
        0,
        maxEntries.length - this._gcOpts.maxEntries,
      )) {
        promises.push(this._persister.removeItem(k));
        delete meta.objects[k];
        deets.removed.push(k);
        deets.removedThresholdCount++;
      }
    }

    // Remove oldest entries until we are under max size
    const delEntries = Object.entries(meta.objects) as Array<[K, ObjectMeta]>;
    delEntries.sort(([_k_a, a_meta], [_k_b, b_meta]) => {
      return a_meta.updatedAt - b_meta.updatedAt;
    });
    const deletableDelEntries = delEntries.filter(([x]) => !sacredKeys.has(x));

    let currentSize = delEntries.reduce((acc, [_k, m]) => {
      return acc + m.size;
    }, 0);

    while (
      currentSize > 0 &&
      currentSize > this._gcOpts.maxSize &&
      deletableDelEntries.length
    ) {
      const [[k, m]] = deletableDelEntries.splice(0, 1);
      currentSize -= m.size;
      promises.push(this._persister.removeItem(k));
      delete meta.objects[k];
      deets.removed.push(k);
      deets.removedSizeCount++;
    }

    // Update meta to remove keys that are no longer in the store
    for (const k of Object.keys(meta.objects)) {
      if (!keys.has(k) && !sacredKeys.has(k)) {
        delete meta.objects[k];
      }
    }

    if (deets.removed.length || deets.metaRemoved.length) {
      // Trigger a flush of the meta
      promises.push(this._enqueuePersist({ skipGc: true }));
    }

    this._log.info('Completed GC', deets);

    await Promise.all(promises);
    return deets;
  }

  // Schedules a GC to run in one minute (unless it is already scheduled)
  gc() {
    if (this._nextGc) {
      return;
    }
    this._nextGc = setTimeout(
      () => {
        safeIdleCallback(() => {
          this._nextGc = null;
          this._gc();
        }, 30 * 1000);
      },
      // 1 minute + some jitter to keep multiple tabs from running at same time
      1000 * 60 + Math.random() * 500,
    );
  }

  private _enqueuePersist(opts?: {
    skipGc?: boolean | null | undefined;
    attempts?: number | null | undefined;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this._nextSave) {
        resolve(0);
        return;
      }

      this._nextSave = setTimeout(() => {
        safeIdleCallback(() => {
          this._nextSave = null;
          this._writeToStorage(opts).then(resolve).catch(reject);
        }, this._idleCallbackMaxWaitMs);
      }, this._saveThrottleMs);
    });
  }

  version() {
    return this._version;
  }

  // Takes a function that updates the store in place.
  // Uses `mutative` to get a list of keys that were changed
  // so that we know which entries we need to persist to the store.
  public updateInPlace(f: (prev: Record<string, T>) => void) {
    this._version++;
    const [state, patches] = create(this.currentValue, f, {
      enablePatches: true,
    });
    for (const patch of patches) {
      const k = patch.path[0];
      if (k && typeof k === 'string') {
        this._pendingSaveKeys.add(k as K);
        if (!this._loadedKeys.has(k as K)) {
          this._loadKey(k as K);
        }
      }
    }

    this.currentValue = state;
    this._enqueuePersist();
    for (const cb of this._subs) {
      cb(this.currentValue);
    }
    return state;
  }

  public subscribe(cb: (value: Record<K, T>) => void) {
    this._subs.push(cb);
    cb(this.currentValue);

    return () => {
      this._subs = this._subs.filter((x) => x !== cb);
    };
  }
}
