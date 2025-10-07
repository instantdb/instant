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
function safeIdleCallback(cb, timeout: number) {
  if (typeof requestIdleCallback === 'undefined') {
    cb();
  } else {
    requestIdleCallback(cb, { timeout });
  }
}

export class PersistedObject<T> {
  _subs = [];
  _persister: Storage;
  _key: string;
  _onMerge: (fromStorage: T, inMemoryValue: T) => any;
  _loadedCbs: Array<() => void>;
  _isLoading: boolean;
  currentValue: T;
  serialize: (T) => any;
  parse: (any) => T;
  _saveThrottleMs: number;
  _idleCallbackMaxWaitMs: number;
  _pendingSaveCbs: Array<() => void>;
  _version: number;
  _nextSave: null | NodeJS.Timeout = null;

  constructor(
    persister: Storage,
    key: string,
    defaultValue: T,
    onMerge: (fromStorage: T, inMemoryValue: T) => any,
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
    this._key = key;

    this._onMerge = onMerge;

    this._loadedCbs = [];
    this._isLoading = true;
    this.currentValue = defaultValue;
    this.serialize = serialize;
    this.parse = parse;
    this._saveThrottleMs = saveThrottleMs;
    this._pendingSaveCbs = [];
    this._version = 0;
    this._idleCallbackMaxWaitMs = idleCallbackMaxWaitMs;

    this._load();
  }

  async _getFromStorage() {
    try {
      return this.parse(await this._persister.getItem(this._key));
    } catch (e) {
      console.error(`Unable to read from storage for key=${this._key}`, e);
      return null;
    }
  }

  async _load() {
    const fromStorage = await this._getFromStorage();
    this._isLoading = false;

    this._onMerge(fromStorage, this.currentValue);
    for (const cb of this._loadedCbs) {
      cb();
    }
  }

  async waitForLoaded(): Promise<void> {
    if (!this._isLoading) {
      return;
    }
    const loadedPromise = new Promise<void>((resolve) => {
      this._loadedCbs.push(resolve);
    });
    await loadedPromise;
  }

  isLoading() {
    return this._isLoading;
  }

  version() {
    return this._version;
  }

  async waitForSync() {
    if (!this._nextSave) {
      return;
    }
    const syncedPromise = new Promise<void>((resolve) => {
      this._pendingSaveCbs.push(resolve);
    });
    await syncedPromise;
  }

  _writeToStorage() {
    this._persister.setItem(this._key, this.serialize(this.currentValue));
    for (const cb of this._pendingSaveCbs) {
      cb();
    }
    this._pendingSaveCbs.length = 0;
  }

  async flush() {
    if (!this._nextSave) {
      return;
    }
    clearTimeout(this._nextSave);
    this._writeToStorage();
  }

  _enqueuePersist(cb) {
    if (this._nextSave) {
      if (cb) {
        this._pendingSaveCbs.push(cb);
      }
      return;
    }
    this._nextSave = setTimeout(() => {
      safeIdleCallback(() => {
        this._nextSave = null;
        this._writeToStorage();
      }, this._idleCallbackMaxWaitMs);
    }, this._saveThrottleMs);
  }

  set(f, cb) {
    this._version++;
    this.currentValue = f(this.currentValue);
    if (this._isLoading) {
      this._loadedCbs.push(() => this._enqueuePersist(cb));
    } else {
      this._enqueuePersist(cb);
    }
    for (const sub of this._subs) {
      sub(this.currentValue);
    }
  }

  subscribe(cb) {
    this._subs.push(cb);
    cb(this.currentValue);

    return () => {
      this._subs = this._subs.filter((x) => x !== cb);
    };
  }
}
