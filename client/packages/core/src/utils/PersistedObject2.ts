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
import { Logger } from './log';

function safeIdleCallback(cb, timeout: number) {
  if (typeof requestIdleCallback === 'undefined') {
    cb();
  } else {
    requestIdleCallback(cb, { timeout });
  }
}

const META_KEY = '__meta';

type ObjectMeta = { createdAt: number; updatedAt: number; size: number };

type Meta = {
  objects: Record<string, ObjectMeta>;
};

export interface Storage {
  getItem(key: string): Promise<any>;
  removeItem(key: string): Promise<void>;
  multiSet(keyValuePairs: Array<[string, any]>): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

export type GCOpts = {
  maxSize: number;
  maxAgeMs: number;
  maxQueries: number;
};

export type Opts = {
  gc: GCOpts;
  saveThrottleMs?: number | null | undefined;
  idleCallbackMaxWaitMs?: number | null | undefined;
};

export class PersistedObject<T, SerializedT> {
  currentValue: Record<string, T>;
  private _subs = [];
  private _persister: Storage;
  private _onMerge: (fromStorage: T, inMemoryValue: T) => T;
  private _loadedCbs: Record<string, Array<() => void>>;
  private serialize: (input: T) => SerializedT;
  private parse: (input: SerializedT) => T;
  private _saveThrottleMs: number;
  private _idleCallbackMaxWaitMs: number;
  private _nextSave: null | NodeJS.Timeout = null;
  private _nextGc: null | NodeJS.Timeout = null;
  private _pendingSaveKeys: Set<string> = new Set();
  private _loadedKeys: Set<string> = new Set();
  private _loadingKeys: Record<string, Promise<T>> = {};
  private _objectSize: (serializedObject: SerializedT) => number;
  private _log: Logger;

  // Maybe this should be a generic onChange?
  onKeyLoaded: (key: string) => void | null | undefined;
  private _version = 0;
  private _meta: {
    isLoading: boolean;
    onLoadCbs: Array<() => void>;
    value: null | Meta;
    error: null | Error;
    attempts: number;
    loadingPromise?: Promise<Meta> | null | undefined;
  } = {
    isLoading: true,
    onLoadCbs: [],
    value: null,
    error: null,
    attempts: 0,
  };
  private _gcOpts: GCOpts;

  constructor(
    persister: Storage,
    /**
     * Merges data from storage with in-memory value on load.
     * The value returned from onMerge will become the current value.
     */
    onMerge: (
      fromStorage: T | null | undefined,
      inMemoryValue: T | null | undefined,
    ) => T,
    serialize: (x: T) => SerializedT,
    parse: (x: SerializedT) => T,
    objectSize: (x: SerializedT) => number,
    log,
    opts: Opts,
  ) {
    this._persister = persister;
    this._onMerge = onMerge;
    this.serialize = serialize;
    this.parse = parse;
    this._objectSize = objectSize;
    this._log = log;
    this._saveThrottleMs = opts.saveThrottleMs ?? 100;
    this._idleCallbackMaxWaitMs = opts.idleCallbackMaxWaitMs ?? 1000;
    this._gcOpts = opts.gc;
    this.currentValue = {};
    this._initMeta();
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
      this._meta.value = (v || {}) as Meta;
    } catch (e) {
      this._meta.error = e;
      this._meta.attempts++;
      this._meta.loadingPromise = null;
    }
  }

  private async _getMeta(): Promise<Meta> {
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

  private async _getFromStorage(key: string) {
    try {
      const data = await this._persister.getItem(key);
      return this.parse(data as SerializedT);
    } catch (e) {
      console.error(`Unable to read from storage for key=${key}`, e);
      return null;
    }
  }

  async waitForKeyToLoad(k: string) {
    if (this._loadedKeys.has(k)) {
      return;
    }
    // XXX: Should do a callback or something here
    return (await this._loadingKeys[k]) || this._loadKey(k);
  }

  private async _loadKey(k: string) {
    if (this._loadedKeys.has(k) || k in this._loadingKeys) return;
    const p = this._getFromStorage(k);
    this._loadingKeys[k] = p;
    const value = await p;
    delete this._loadingKeys[k];
    this._loadedKeys.add(k);
    if (value) {
      const merged = this._onMerge(value, this.currentValue[k]);
      this.currentValue[k] = merged;
      this.onKeyLoaded && this.onKeyLoaded(k);
    }
  }

  private _writeToStorage() {
    if (this._meta.isLoading) {
      // Wait for meta to load and try again, give it
      // 5 seconds so that we don't spend too much time retrying
      // XXX: Maybe we should make this delay increase on each attempt
      setTimeout(() => this._enqueuePersist(), 5000);
    }
    const metaValue = this._meta.value;
    if (!metaValue) {
      // If it's not loading and we don't have the data, then there
      // must be an error and we're not going to be able to save until
      // the error is resolved elsewhere.
      return;
    }
    const keysToDelete = [];
    const keysToUpdate = [];
    for (const k of this._pendingSaveKeys) {
      if (!(k in this.currentValue)) {
        keysToDelete.push(k);
        delete metaValue[k];
      } else {
        keysToUpdate.push(k);
      }
    }

    for (const k of keysToDelete) {
      this._persister.removeItem(k);
      this._loadedKeys.delete(k);
      this._pendingSaveKeys.delete(k);
    }

    const keysToLoad = [];

    const kvPairs: Array<[string, any]> = [[META_KEY, metaValue]];
    const metaObjects = metaValue.objects ?? {};
    metaValue.objects = metaObjects;
    for (const k of keysToUpdate) {
      if (this._loadedKeys.has(k)) {
        const serializedV = this.serialize(this.currentValue[k]);
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

    this._persister.multiSet(kvPairs);

    // For the keys that haven't loaded, load the key then try
    // persisting again. This will prevent a race where the
    for (const k of keysToLoad) {
      this._loadKey(k).then(() => this._enqueuePersist());
    }

    this.gc();
  }

  async flush() {
    if (!this._nextSave) {
      return;
    }
    clearTimeout(this._nextSave);
    this._writeToStorage();
  }

  private async _gc() {
    // First, remove all keys we don't know about
    const keys = await this._persister.getAllKeys();
    const meta = await this._getMeta();
    if (!meta) {
      this._log.info('Could not gc because we were not able to load meta');
      return;
    }
    const deets = {
      removed: [],
      removedMissingCount: 0,
      removedOldCount: 0,
      removedThresholdCount: 0,
      removedSizeCount: 0,
    };
    for (const key of keys) {
      if (
        key in this.currentValue ||
        key in meta.objects ||
        this._loadedKeys.has(key) ||
        key in this._loadingKeys
      ) {
        continue;
      }
      this._persister.removeItem(key);
      deets.removed.push(key);
      deets.removedMissingCount++;
    }

    // XXX: clean out meta also
    // Remove anything over the max age
    const now = Date.now();
    for (const [k, m] of Object.entries(meta.objects)) {
      if (m.updatedAt < now - this._gcOpts.maxAgeMs) {
        this._persister.removeItem(k);
        delete meta.objects[k];
        deets.removed.push(k);
        deets.removedOldCount++;
      }
    }

    // Keep queries under max queries
    const entries = Object.entries(meta.objects);
    entries.sort(([_k_a, a_meta], [_k_b, b_meta]) => {
      return a_meta.updatedAt - b_meta.updatedAt;
    });
    if (entries.length > this._gcOpts.maxSize) {
      for (const [k] of entries.slice(
        0,
        entries.length - this._gcOpts.maxSize,
      )) {
        this._persister.removeItem(k);
        delete meta.objects[k];
        deets.removed.push(k);
        deets.removedThresholdCount++;
        entries.splice(0, 1);
      }
    }

    // Remove oldest entries until we are under max size
    let currentSize = entries.reduce((acc, [_k, m]) => {
      return acc + m.size;
    }, 0);

    while (
      currentSize > 0 &&
      currentSize < this._gcOpts.maxSize &&
      entries.length
    ) {
      const [[k, m]] = entries.splice(0, 1);
      currentSize -= m.size;
      this._persister.removeItem(k);
      delete meta.objects[k];
      deets.removed.push(k);
      deets.removedSizeCount++;
    }

    if (deets.removed.length) {
      // Trigger a flush of the meta
      this._enqueuePersist();
    }

    this._log.info('Completed GC', deets);
  }

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
      1000 * 60 * 10,
    );
  }

  private _enqueuePersist() {
    if (this._nextSave) {
      return;
    }
    this._nextSave = setTimeout(() => {
      safeIdleCallback(() => {
        this._nextSave = null;
        this._writeToStorage();
      }, this._idleCallbackMaxWaitMs);
    }, this._saveThrottleMs);
  }

  version() {
    return this._version;
  }

  updateInPlace(f: (prev: Record<string, T>) => void) {
    this._version++;
    const [state, patches] = create(this.currentValue, f, {
      enablePatches: true,
    });
    for (const patch of patches) {
      const k = patch.path[0];
      if (k && typeof k === 'string') {
        this._pendingSaveKeys.add(k);
        if (!this._loadedKeys.has(k)) {
          this._loadKey(k);
        }
      }
    }

    this.currentValue = state;
    this._enqueuePersist();
    return state;
  }
}
