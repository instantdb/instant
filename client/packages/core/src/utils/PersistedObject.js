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
export class PersistedObject {
  constructor(
    persister,
    key,
    defaultValue,
    onMerge,
    toJSON = (x) => {
      return JSON.stringify(x);
    },
    fromJSON = (x) => {
      return JSON.parse(x);
    },
  ) {
    this._persister = persister;
    this._key = key;

    this._onMerge = onMerge;

    this._loadedCbs = [];
    this._isLoading = true;
    this.currentValue = defaultValue;
    this.toJSON = toJSON;
    this.fromJSON = fromJSON;

    this._load();
  }

  async _load() {
    const fromStorage = this.fromJSON(await this._persister.getItem(this._key));
    this._isLoading = false;

    this._onMerge(fromStorage, this.currentValue);
    for (const cb of this._loadedCbs) {
      cb();
    }
  }

  async waitForLoaded() {
    if (!this._isLoading) {
      return;
    }
    const loadedPromise = new Promise((resolve) => {
      this._loadedCbs.push(resolve);
    });
    await loadedPromise;
  }

  set(f, cb) {
    this.currentValue = f(this.currentValue);
    if (!this._isLoading) {
      setTimeout(() => {
        this._persister.setItem(this._key, this.toJSON(this.currentValue));
        if (cb) {
          cb();
        }
      }, 0);
    }
  }
}
