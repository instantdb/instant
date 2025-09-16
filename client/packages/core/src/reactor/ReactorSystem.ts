import uuid from '../utils/uuid.ts';
import weakHash from '../utils/weakHash.ts';
import createLogger from '../utils/log.ts';
import { createConnectionActor } from './network/connectionActor.ts';
import { createQueryActor } from './query/queryActor.ts';
import { createMutationActor } from './mutation/mutationActor.ts';
import { createPresenceActor } from './presence/presenceActor.ts';
import { createPersistedState } from './storage/persistedState.ts';
import { InMemoryStorageDriver } from './storage/inMemoryDriver.ts';
import type { Scheduler, StorageDriver, WebSocketLike } from './types.ts';
import type { Logger } from '../utils/log.ts';
import type { QueryResultEnvelope, QueryError } from './query/queryActor.ts';
import type { MutationNotification } from './mutation/mutationActor.ts';
import type { PresenceNotification } from './presence/presenceActor.ts';
import type { MutationCacheEntry } from './mutation/mutationActor.ts';
import type { QueryCacheEntry } from './query/queryActor.ts';

export interface ReactorSystemOptions {
  createWebSocket: () => WebSocketLike;
  scheduler: Scheduler;
  storageDriver?: StorageDriver;
  logger?: Logger;
  defaultMutationTimeoutMs?: number;
  queryCacheLimit?: number;
}

interface QueryListener {
  id: string;
  callback: (result: QueryResultEnvelope | undefined) => void;
}

function createDefaultScheduler(): Scheduler {
  return {
    setTimeout(handler, ms) {
      return globalThis.setTimeout(handler, ms) as unknown as number;
    },
    clearTimeout(id) {
      globalThis.clearTimeout(id as unknown as number);
    },
  };
}

export class ReactorSystem {
  private readonly logger: Logger;
  private readonly scheduler: Scheduler;
  private readonly storageDriver: StorageDriver;

  private readonly queriesPersisted;

  private readonly mutationsPersisted;

  private readonly connection;
  private readonly query;
  private readonly mutation;
  private readonly presence;

  private readonly queryListeners = new Map<string, Set<QueryListener>>();
  private readonly queryRevisions = new Map<string, number>();
  private readonly mutationDeferreds = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();
  private readonly presenceListeners = new Map<string, Set<(peers: Record<string, unknown>) => void>>();
  private readonly broadcastListeners = new Map<string, Map<string, Set<(payload: unknown) => void>>>();

  private processingNetwork = false;
  private processingMutations = false;
  private processingPresence = false;

  constructor(options: ReactorSystemOptions) {
    this.scheduler = options.scheduler ?? createDefaultScheduler();
    this.storageDriver = options.storageDriver ?? new InMemoryStorageDriver();
    this.logger = options.logger ?? createLogger(false);

    this.queriesPersisted = createPersistedState<Record<string, QueryCacheEntry>>({
      name: 'queries',
      namespace: 'reactor',
      key: 'queries',
      driver: this.storageDriver,
      initialValue: {},
    });

    this.mutationsPersisted = createPersistedState<Record<string, MutationCacheEntry>>({
      name: 'mutations',
      namespace: 'reactor',
      key: 'mutations',
      driver: this.storageDriver,
      initialValue: {},
    });

    this.connection = createConnectionActor({
      logger: this.logger,
      scheduler: this.scheduler,
      createWebSocket: options.createWebSocket,
      reconnectDelayMs: (attempt) => Math.min(5000, 500 * attempt),
    });

    this.query = createQueryActor({
      persisted: this.queriesPersisted,
      createEventId: () => uuid(),
      logger: this.logger,
      queryCacheLimit: options.queryCacheLimit ?? 10,
    });

    this.mutation = createMutationActor({
      persisted: this.mutationsPersisted,
      scheduler: this.scheduler,
      logger: this.logger,
      defaultTimeoutMs: options.defaultMutationTimeoutMs ?? 30_000,
    });

    this.presence = createPresenceActor({ logger: this.logger });

    this.query.subscribe((state) => {
      this.handleQueryState(state);
    });
    this.mutation.subscribe(() => {
      void this.drainMutationNotifications();
    });
    this.connection.subscribe(() => {
      void this.drainNetworkMessages();
    });
    this.presence.subscribe(() => {
      void this.drainPresenceNotifications();
    });
  }

  start(): void {
    this.connection.send({ type: 'connect' });
  }

  async flush(): Promise<void> {
    await this.connection.ask({ type: 'noop' });
    await this.query.ask({ type: 'noop' });
    await this.mutation.ask({ type: 'noop' });
    await this.presence.ask({ type: 'noop' });
  }

  subscribeQuery(
    query: unknown,
    listener: (result: QueryResultEnvelope | undefined) => void,
  ): () => void {
    const hash = weakHash(query);
    const listenerId = uuid();

    const registerListener = () => {
      if (!this.queryListeners.has(hash)) {
        this.queryListeners.set(hash, new Set());
      }
      const listeners = this.queryListeners.get(hash)!;
      const entry: QueryListener = { id: listenerId, callback: listener };
      listeners.add(entry);
    };

    const execute = async () => {
      const response = await this.query.ask({
        type: 'subscribe',
        payload: {
          hash,
          query,
          subscriberId: listenerId,
          now: Date.now(),
        },
      });
      registerListener();
      if (response.cachedResult) {
        listener(response.cachedResult);
      }
      if (response.shouldFetch) {
        const message = JSON.stringify({
          type: 'add-query',
          eventId: response.eventId,
          query,
          hash,
        });
        this.connection.send({ type: 'send', payload: message });
      }
    };

    void execute();

    return () => {
      this.query.ask({
        type: 'unsubscribe',
        payload: { hash, subscriberId: listenerId },
      }).then((resp) => {
        if (resp?.shouldRemove) {
          const message = JSON.stringify({ type: 'remove-query', hash });
          this.connection.send({ type: 'send', payload: message });
        }
      });
      const listeners = this.queryListeners.get(hash);
      if (listeners) {
        for (const entry of listeners) {
          if (entry.id === listenerId) {
            listeners.delete(entry);
          }
        }
        if (listeners.size === 0) {
          this.queryListeners.delete(hash);
        }
      }
    };
  }

  async queryOnce(query: unknown): Promise<QueryResultEnvelope> {
    const hash = weakHash(query);
    return new Promise((resolve, reject) => {
      void this.query
        .ask({
          type: 'request-once',
          payload: {
            hash,
            query,
            requestId: uuid(),
            now: Date.now(),
            resolve,
            reject,
          },
        })
        .then((resp) => {
          const message = JSON.stringify({
            type: 'add-query',
            eventId: resp.eventId,
            query,
            hash,
            once: true,
          });
          this.connection.send({ type: 'send', payload: message });
        })
        .catch(reject);
    });
  }

  async transact(steps: unknown[]): Promise<{ eventId: string; txId: number }> {
    const eventId = uuid();
    await this.mutation.ask({
      type: 'enqueue',
      payload: {
        eventId,
        steps,
        enqueuedAt: Date.now(),
      },
    });
    const message = JSON.stringify({ type: 'transact', eventId, steps });
    this.connection.send({ type: 'send', payload: message });

    const promise = new Promise<{ eventId: string; txId: number }>((resolve, reject) => {
      this.mutationDeferreds.set(eventId, { resolve, reject });
    });

    await this.mutation.ask({
      type: 'mark-sent',
      eventId,
      now: Date.now(),
    });

    return promise;
  }

  onPresence(roomId: string, listener: (peers: Record<string, unknown>) => void) {
    if (!this.presenceListeners.has(roomId)) {
      this.presenceListeners.set(roomId, new Set());
    }
    this.presenceListeners.get(roomId)!.add(listener);
    this.presence.send({ type: 'ensure-room', roomId });
    return () => {
      const set = this.presenceListeners.get(roomId);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.presenceListeners.delete(roomId);
        this.presence.send({ type: 'leave-room', roomId });
      }
    };
  }

  setLocalPresence(roomId: string, payload: unknown) {
    this.presence.send({ type: 'set-local-presence', roomId, payload });
  }

  onBroadcast(
    roomId: string,
    topic: string,
    listener: (payload: unknown) => void,
  ) {
    if (!this.broadcastListeners.has(roomId)) {
      this.broadcastListeners.set(roomId, new Map());
    }
    const topics = this.broadcastListeners.get(roomId)!;
    if (!topics.has(topic)) topics.set(topic, new Set());
    topics.get(topic)!.add(listener);
    this.presence.send({ type: 'ensure-room', roomId });
    return () => {
      const topicSet = topics.get(topic);
      if (!topicSet) return;
      topicSet.delete(listener);
      if (topicSet.size === 0) topics.delete(topic);
      if (topics.size === 0) this.broadcastListeners.delete(roomId);
    };
  }

  broadcast(roomId: string, topic: string, payload: unknown) {
    this.presence.send({ type: 'enqueue-broadcast', roomId, topic, payload });
  }

  receiveMessage(raw: string) {
    const message = JSON.parse(raw) as ServerMessage;
    switch (message.type) {
      case 'query-result':
        this.query.send({
          type: 'set-result',
          hash: message.hash,
          result: message.result,
          now: Date.now(),
        });
        if (message.onceEventId) {
          this.query.send({
            type: 'resolve-once',
            hash: message.hash,
            eventId: message.onceEventId,
            result: message.result,
          });
        }
        break;
      case 'query-error':
        this.query.send({
          type: 'set-error',
          hash: message.hash,
          error: message.error,
          now: Date.now(),
        });
        if (message.onceEventId) {
          this.query.send({
            type: 'reject-once',
            hash: message.hash,
            eventId: message.onceEventId,
            error: message.error,
          });
        }
        break;
      case 'mutation-ack':
        this.mutation.send({
          type: 'ack',
          eventId: message.eventId,
          txId: message.txId,
          now: Date.now(),
        });
        break;
      case 'mutation-error':
        this.mutation.send({
          type: 'fail',
          eventId: message.eventId,
          error: message.error,
        });
        break;
      case 'presence-update':
        this.presence.send({
          type: 'update-peers',
          roomId: message.roomId,
          peers: message.peers,
        });
        break;
      case 'room-joined':
        this.presence.send({ type: 'mark-joined', roomId: message.roomId });
        break;
      case 'room-left':
        this.presence.send({ type: 'mark-left', roomId: message.roomId });
        break;
      case 'server-broadcast':
        this.presence.send({
          type: 'incoming-broadcast',
          roomId: message.roomId,
          topic: message.topic,
          payload: message.payload,
        });
        break;
      default:
        this.logger.debug('Unknown server message', message);
    }
  }

  private handleQueryState(state: ReturnType<typeof this.query.snapshot>) {
    for (const [hash, revision] of Object.entries(state.revisions)) {
      const prev = this.queryRevisions.get(hash) ?? 0;
      if (revision !== prev) {
        this.queryRevisions.set(hash, revision);
        const entry = state.persisted[hash];
        this.notifyQueryListeners(hash, entry?.result);
      }
    }
  }

  private notifyQueryListeners(hash: string, result: QueryResultEnvelope | undefined) {
    const listeners = this.queryListeners.get(hash);
    if (!listeners) return;
    for (const listener of listeners) {
      listener.callback(result);
    }
  }

  private async drainMutationNotifications() {
    if (this.processingMutations) return;
    this.processingMutations = true;
    try {
      const notifications: MutationNotification[] = await this.mutation.ask({
        type: 'drain-notifications',
      });
      for (const notification of notifications) {
        const deferred = this.mutationDeferreds.get(notification.eventId);
        if (!deferred) continue;
        switch (notification.type) {
          case 'ack':
            deferred.resolve({ eventId: notification.eventId, txId: notification.txId });
            this.mutationDeferreds.delete(notification.eventId);
            break;
          case 'timeout':
            deferred.reject(new Error('Mutation timed out'));
            this.mutationDeferreds.delete(notification.eventId);
            break;
          case 'error':
            deferred.reject(notification.error ?? new Error('Mutation failed'));
            this.mutationDeferreds.delete(notification.eventId);
            break;
        }
      }
    } finally {
      this.processingMutations = false;
    }
  }

  private async drainNetworkMessages() {
    if (this.processingNetwork) return;
    this.processingNetwork = true;
    try {
      const packets = [...this.connection.snapshot.inbox];
      for (const packet of packets) {
        this.receiveMessage(packet.payload);
        this.connection.send({ type: 'ack-message', packetId: packet.id });
      }
    } finally {
      this.processingNetwork = false;
    }
  }

  private async drainPresenceNotifications() {
    if (this.processingPresence) return;
    this.processingPresence = true;
    try {
      const notifications: PresenceNotification[] = await this.presence.ask({
        type: 'drain-notifications',
      });
      for (const notification of notifications) {
        switch (notification.type) {
          case 'join-room':
            this.connection.send({
              type: 'send',
              payload: JSON.stringify({ type: 'join-room', roomId: notification.roomId }),
            });
            break;
          case 'leave-room':
            this.connection.send({
              type: 'send',
              payload: JSON.stringify({ type: 'leave-room', roomId: notification.roomId }),
            });
            break;
          case 'send-presence':
            this.connection.send({
              type: 'send',
              payload: JSON.stringify({
                type: 'set-presence',
                roomId: notification.roomId,
                presence: notification.payload,
              }),
            });
            break;
          case 'broadcast':
            this.connection.send({
              type: 'send',
              payload: JSON.stringify({
                type: 'broadcast',
                roomId: notification.roomId,
                topic: notification.topic,
                payload: notification.payload,
              }),
            });
            break;
          case 'presence-updated': {
            const listeners = this.presenceListeners.get(notification.roomId);
            if (!listeners) break;
            for (const listener of listeners) {
              listener(notification.payload as Record<string, unknown>);
            }
            break;
          }
          case 'incoming-broadcast': {
            const topics = this.broadcastListeners.get(notification.roomId);
            if (!topics) break;
            const listeners = topics.get(notification.topic ?? '');
            if (!listeners) break;
            for (const listener of listeners) {
              listener(notification.payload);
            }
            break;
          }
        }
      }
    } finally {
      this.processingPresence = false;
    }
  }
}

type ServerMessage =
  | { type: 'query-result'; hash: string; result: QueryResultEnvelope; onceEventId?: string }
  | { type: 'query-error'; hash: string; error: QueryError; onceEventId?: string }
  | { type: 'mutation-ack'; eventId: string; txId: number }
  | { type: 'mutation-error'; eventId: string; error: { message: string; hint?: unknown } }
  | { type: 'presence-update'; roomId: string; peers: Record<string, unknown> }
  | { type: 'room-joined'; roomId: string }
  | { type: 'room-left'; roomId: string }
  | { type: 'server-broadcast'; roomId: string; topic: string; payload: unknown };
