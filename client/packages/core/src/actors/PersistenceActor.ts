import { BaseActor, Message } from './BaseActor.js';
import { PersistedObject } from '../utils/PersistedObject.js';

export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface PersistenceState {
  isLoaded: boolean;
}

/**
 * PersistenceActor wraps PersistedObject to provide persistence
 * for query results and pending mutations.
 *
 * Receives:
 * - { type: 'persist:set', key: string, value: any }
 * - { type: 'persist:get', key: string }
 * - { type: 'persist:flush', key?: string }
 *
 * Publishes:
 * - { type: 'persist:loaded', key: string, value: any }
 * - { type: 'persist:ready' }
 */
export class PersistenceActor extends BaseActor<PersistenceState> {
  private storage: Storage;
  private persistedObjects: Map<string, PersistedObject> = new Map();
  private pendingLoads: Set<string> = new Set();

  constructor(storage: Storage) {
    super('Persistence', { isLoaded: false });
    this.storage = storage;
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'persist:register':
        this.registerPersistedObject(message.key, message.config);
        break;

      case 'persist:set':
        this.setPersistedValue(message.key, message.value);
        break;

      case 'persist:get':
        this.getPersistedValue(message.key);
        break;

      case 'persist:flush':
        if (message.key) {
          this.flushOne(message.key);
        } else {
          this.flushAll();
        }
        break;
    }
  }

  private registerPersistedObject(
    key: string,
    config: {
      defaultValue: any;
      onMerge: (storageValue: any, memoryValue: any) => void;
      toJSON?: (value: any) => string;
      fromJSON?: (json: string) => any;
    },
  ): void {
    const persisted = new PersistedObject(
      this.storage,
      key,
      config.defaultValue,
      (storageValue, memoryValue) => {
        config.onMerge(storageValue, memoryValue);
        this.publish({
          type: 'persist:merged',
          key,
        });
        this.checkIfAllLoaded();
      },
      config.toJSON,
      config.fromJSON,
    );

    this.persistedObjects.set(key, persisted);
    this.pendingLoads.add(key);

    // Subscribe to changes
    persisted.subscribe((value) => {
      this.publish({
        type: 'persist:changed',
        key,
        value,
      });
    });
  }

  private checkIfAllLoaded(): void {
    for (const [key, obj] of this.persistedObjects.entries()) {
      if (obj.isLoading()) {
        return;
      }
      this.pendingLoads.delete(key);
    }

    if (!this.state.isLoaded && this.pendingLoads.size === 0) {
      this.state = { isLoaded: true };
      this.publish({ type: 'persist:ready' });
    }
  }

  private setPersistedValue(key: string, value: any): void {
    const obj = this.persistedObjects.get(key);
    if (!obj) {
      console.error(`No persisted object registered for key: ${key}`);
      return;
    }

    obj.set(() => value);
  }

  private getPersistedValue(key: string): void {
    const obj = this.persistedObjects.get(key);
    if (!obj) {
      console.error(`No persisted object registered for key: ${key}`);
      return;
    }

    this.publish({
      type: 'persist:value',
      key,
      value: obj.currentValue,
    });
  }

  private flushOne(key: string): void {
    const obj = this.persistedObjects.get(key);
    if (obj) {
      obj.flush();
    }
  }

  private flushAll(): void {
    for (const obj of this.persistedObjects.values()) {
      obj.flush();
    }
  }

  async waitForLoaded(): Promise<void> {
    if (this.state.isLoaded) {
      return;
    }

    return new Promise((resolve) => {
      const unsub = this.subscribe((msg) => {
        if (msg.type === 'persist:ready') {
          unsub();
          resolve();
        }
      });
    });
  }

  shutdown(): void {
    super.shutdown();
    this.flushAll();
  }
}
