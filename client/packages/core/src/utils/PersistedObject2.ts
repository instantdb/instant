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

function safeIdleCallback(cb, timeout: number) {
  if (typeof requestIdleCallback === 'undefined') {
    cb();
  } else {
    requestIdleCallback(cb, { timeout });
  }
}

const META_KEY = '__meta';

export class PersistedObject<T> {
  _subs = [];
  _persister: Storage;
  _onMerge: (fromStorage: T, inMemoryValue: T) => T;
  _loadedCbs: Record<string, Array<() => void>>;
  serialize: (input: T) => any;
  parse: (input: any) => T;
  _saveThrottleMs: number;
  _idleCallbackMaxWaitMs: number;
  _nextSave: null | NodeJS.Timeout = null;
  _pendingSaveKeys: Set<string> = new Set();
  _loadedKeys: Set<string> = new Set();
  _loadingKeys: Record<string, Promise<T>> = {};
  currentValue: Record<string, T>;
  _onKeyLoaded: (key: string) => void;
  _version = 0;
  _meta = {
    isLoading: true,
    onLoadCbs: [],
    value: null,
    error: null,
    attempts: 0,
  };

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
    onKeyLoaded: (key: string) => void,
    serialize = (x: T): any => {
      return x;
    },
    parse = (x: any): T => {
      return x;
    },
    saveThrottleMs = 100,
    idleCallbackMaxWaitMs = 1000,
  ) {
    this._persister = persister;

    this._onMerge = onMerge;

    this.serialize = serialize;
    this.parse = parse;
    this._saveThrottleMs = saveThrottleMs;
    this._idleCallbackMaxWaitMs = idleCallbackMaxWaitMs;
    this._onKeyLoaded = onKeyLoaded;
    this.currentValue = {};
    this._initMeta();
  }

  async _initMeta() {
    try {
      const v = await this._persister.getItem(META_KEY);
      this._meta.isLoading = false;
      this._meta.error = null;
      this._meta.value = v || {};
      // XXX: NEXT UP: update meta when we do any write or delete
    } catch (e) {
      this._meta.error = e;
      this._meta.attempts++;
    }
  }

  async _getFromStorage(key: string) {
    try {
      return this.parse(await this._persister.getItem(key));
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

  async _loadKey(k: string) {
    if (this._loadedKeys.has(k) || k in this._loadingKeys) return;
    const p = this._getFromStorage(k);
    this._loadingKeys[k] = p;
    const value = await p;
    delete this._loadingKeys[k];
    this._loadedKeys.add(k);
    if (value) {
      const merged = this._onMerge(value, this.currentValue[k]);
      this.currentValue[k] = merged;
      this._onKeyLoaded(k);
    }
  }

  _writeToStorage() {
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

    const kvPairs = [];
    for (const k of keysToUpdate) {
      if (this._loadedKeys.has(k)) {
        this._persister.setItem(k, this.serialize(this.currentValue[k]));
        kvPairs.push([k, this.serialize(this.currentValue[k])]);
        metaValue[k] = metaValue[k] ?? { createdAt: Date.now() };
        metaValue[k].updatedAt = Date.now();
        this._pendingSaveKeys.delete(k);
      } else {
        keysToLoad.push(k);
      }
    }

    if (kvPairs.length) {
      // We won't update meta for deleted items if none were updated, but the meta
      // will update eventually when something finally updates or when we GC.
      kvPairs.push([META_KEY, metaValue]);
      this._persister.multiSet(kvPairs);
    }

    // For the keys that haven't loaded, load the key then try
    // persisting again. This will prevent a race where the
    for (const k of keysToLoad) {
      this._loadKey(k).then(() => this._enqueuePersist());
    }
  }

  async flush() {
    if (!this._nextSave) {
      return;
    }
    clearTimeout(this._nextSave);
    this._writeToStorage();
  }

  _enqueuePersist() {
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
