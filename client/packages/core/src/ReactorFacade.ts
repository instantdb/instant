// ReactorFacade - Composes all actors into the Reactor interface
import { MessageRouterActor } from './actors/MessageRouterActor.js';
import { NetworkActor } from './actors/NetworkActor.js';
import { ConnectionActor } from './actors/ConnectionActor.js';
import { PersistenceActor } from './actors/PersistenceActor.js';
import { QueryActor } from './actors/QueryActor.js';
import { MutationActor } from './actors/MutationActor.js';
import { AuthActor } from './actors/AuthActor.js';
import { PresenceActor } from './actors/PresenceActor.js';
import { BroadcastActor } from './actors/BroadcastActor.js';
import { StorageActor } from './actors/StorageActor.js';
import IndexedDBStorage from './IndexedDBStorage.js';
import WindowNetworkListener from './WindowNetworkListener.js';
import { validate as validateUUID } from 'uuid';
import * as instaml from './instaml.js';
import { validateQuery } from './queryValidation.js';
import { validateTransactions } from './transactionValidation.js';

const defaultConfig = {
  apiURI: 'https://api.instantdb.com',
  websocketURI: 'wss://api.instantdb.com/runtime/session',
};

function isClient() {
  const hasWindow = typeof window !== 'undefined';
  // @ts-ignore
  const isChrome = typeof chrome !== 'undefined';
  return hasWindow || isChrome;
}

/**
 * ReactorFacade composes all actors into a single facade
 * that maintains the same API as the original Reactor.
 */
export class ReactorFacade {
  // Actors
  private messageRouter: MessageRouterActor;
  private network: NetworkActor;
  private connection: ConnectionActor;
  private persistence: PersistenceActor;
  private query: QueryActor;
  private mutation: MutationActor;
  private auth: AuthActor;
  private presence: PresenceActor;
  private broadcast: BroadcastActor;
  private storage: StorageActor;

  // Config
  config: any;
  versions: any;

  constructor(
    config: any,
    Storage = IndexedDBStorage,
    NetworkListener = WindowNetworkListener,
    versions?: any,
  ) {
    this.config = { ...defaultConfig, ...config };
    this.versions = { ...(versions || {}) };

    if (!config.appId) {
      throw new Error('Instant must be initialized with an appId.');
    }

    if (!validateUUID(config.appId)) {
      throw new Error(
        `Instant must be initialized with a valid appId. \`${config.appId}\` is not a valid uuid.`,
      );
    }

    // Create default WebSocket factory
    const defaultWSFactory = {
      create: (url: string) => new WebSocket(url),
    };

    // Create default logger
    const defaultLogger = {
      info: (...args: any[]) => console.log(...args),
      error: (...args: any[]) => console.error(...args),
    };

    // Initialize actors
    this.messageRouter = new MessageRouterActor();
    this.network = new NetworkActor(NetworkListener);
    this.connection = new ConnectionActor(
      this.config.websocketURI,
      config.appId,
      defaultWSFactory,
      defaultLogger,
    );
    // Create storage instance - Storage can be either a class or an object
    const storageInstance = typeof Storage === 'function'
      ? new Storage()
      : (Storage || { getItem: async () => null, setItem: async () => {} });
    this.persistence = new PersistenceActor(storageInstance);
    this.query = new QueryActor();
    this.mutation = new MutationActor();
    this.auth = new AuthActor();
    this.presence = new PresenceActor();
    this.broadcast = new BroadcastActor();
    this.storage = new StorageActor();

    // Wire actors together (only if client-side)
    if (isClient()) {
      this.wireActors();
      // Initialize async actors
      this.initializeAsync();
    }
  }

  /**
   * Wire actors together via message passing
   */
  private wireActors(): void {
    // Connection -> MessageRouter
    this.connection.subscribe((msg: any) => {
      if (msg.type === 'ws:message') {
        this.messageRouter.receive(msg);
      }
    });

    // MessageRouter -> All actors
    this.messageRouter.subscribe((msg: any) => {
      this.query.receive(msg);
      this.mutation.receive(msg);
      this.auth.receive(msg);
      this.presence.receive(msg);
      this.broadcast.receive(msg);
    });

    // Network -> Connection
    this.network.subscribe((msg: any) => {
      this.connection.receive(msg);
    });

    // Query -> Connection (for sending queries)
    this.query.subscribe((msg: any) => {
      if (msg.type === 'connection:send') {
        this.connection.receive(msg);
      }
    });

    // Mutation -> Connection (for sending mutations)
    this.mutation.subscribe((msg: any) => {
      if (msg.type === 'connection:send') {
        this.connection.receive(msg);
      }
      if (msg.type === 'query:notify-all') {
        this.query.receive(msg);
      }
    });

    // Presence -> Connection
    this.presence.subscribe((msg: any) => {
      if (msg.type === 'connection:send') {
        this.connection.receive(msg);
      }
    });

    // Broadcast -> Connection
    this.broadcast.subscribe((msg: any) => {
      if (msg.type === 'connection:send') {
        this.connection.receive(msg);
      }
    });

    // Presence -> Broadcast (for peer data)
    this.presence.subscribe((msg: any) => {
      if (msg.type === 'presence:updated') {
        this.broadcast.receive(msg);
      }
    });
  }

  /**
   * Initialize async actors
   */
  private async initializeAsync(): Promise<void> {
    await this.network.initialize();
  }

  // ======================
  // Query API
  // ======================

  subscribeQuery(q: any, cb: (data: any) => void, opts?: any): () => void {
    if (!this.config.disableValidation) {
      validateQuery(q, this.config.schema);
    }

    this.query.receive({
      type: 'query:subscribe',
      q,
      cb,
      opts,
    });

    return () => {
      this.query.receive({
        type: 'query:unsubscribe',
        q,
        cb,
      });
    };
  }

  queryOnce(q: any, opts?: any): Promise<any> {
    if (!this.config.disableValidation) {
      validateQuery(q, this.config.schema);
    }

    return new Promise((resolve, reject) => {
      this.query.receive({
        type: 'query:once',
        q,
        opts,
        resolve,
        reject,
      });
    });
  }

  // ======================
  // Mutation API
  // ======================

  pushTx(chunks: any): string {
    if (!this.config.disableValidation) {
      validateTransactions(chunks, this.config.schema);
    }

    // Transform chunks to tx-steps
    // For now, simplified - in real implementation would need optimisticAttrs
    const txSteps = instaml.transform(
      {
        attrs: {},
        schema: this.config.schema,
        stores: [],
        useDateObjects: this.config.useDateObjects,
      },
      chunks,
    );

    return this.pushOps(txSteps);
  }

  pushOps(txSteps: any[], error?: any): string {
    let eventId: string | undefined;

    // Subscribe to get the eventId
    const unsubscribe = this.mutation.subscribe((msg: any) => {
      if (msg.type === 'mutation:pushed' && !eventId) {
        eventId = msg.eventId;
      }
    });

    // Send the mutation
    this.mutation.receive({
      type: 'mutation:push',
      txSteps,
      error,
    });

    // Cleanup and return (eventId will be set synchronously by MutationActor)
    unsubscribe();
    return eventId!;
  }

  // ======================
  // Auth API
  // ======================

  subscribeAuth(cb: (auth: any) => void): () => void {
    const unsubscribe = this.auth.subscribe((msg: any) => {
      if (msg.type === 'auth:changed') {
        cb(msg.user);
      }
    });

    // Notify immediately with current state
    this.auth.receive({
      type: 'auth:get-user',
    });

    return unsubscribe;
  }

  async getCurrentUser(): Promise<any> {
    return this.auth.getUser();
  }

  updateUser(user: any): void {
    this.auth.receive({
      type: 'auth:set-user',
      user,
    });
  }

  // ======================
  // Presence API
  // ======================

  joinRoom(roomId: string): void {
    this.presence.receive({
      type: 'presence:join-room',
      roomId,
    });
  }

  publishPresence(roomType: string, roomId: string, data: any): void {
    this.presence.receive({
      type: 'presence:set',
      roomId: `${roomType}/${roomId}`,
      data,
    });
  }

  subscribePresence(
    roomType: string,
    roomId: string,
    opts: any,
    cb: (presence: any) => void,
  ): () => void {
    const fullRoomId = `${roomType}/${roomId}`;

    this.presence.subscribe((msg: any) => {
      if (msg.type === 'presence:updated' && msg.roomId === fullRoomId) {
        cb(msg.presence);
      }
    });

    this.joinRoom(fullRoomId);

    return () => {
      this.presence.receive({
        type: 'presence:leave-room',
        roomId: fullRoomId,
      });
    };
  }

  // ======================
  // Broadcast API
  // ======================

  publishTopic({
    roomType,
    roomId,
    topic,
    data,
  }: {
    roomType: string;
    roomId: string;
    topic: string;
    data: any;
  }): void {
    const fullRoomId = `${roomType}/${roomId}`;
    this.broadcast.receive({
      type: 'broadcast:publish',
      roomId: fullRoomId,
      topic,
      data,
    });
  }

  subscribeTopic(roomId: string, topic: string, cb: (data: any, peer: any) => void): () => void {
    this.broadcast.receive({
      type: 'broadcast:subscribe',
      roomId,
      topic,
      callback: cb,
    });

    return () => {
      this.broadcast.receive({
        type: 'broadcast:unsubscribe',
        roomId,
        topic,
        callback: cb,
      });
    };
  }

  // ======================
  // Storage API
  // ======================

  async uploadFile(path: string, file: any, opts?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.storage.subscribe((msg: any) => {
        if (msg.type === 'storage:upload-complete' && msg.path === path) {
          resolve(msg.result);
        }
        if (msg.type === 'storage:error' && msg.operation === 'upload') {
          reject(msg.error);
        }
      });

      this.storage.receive({
        type: 'storage:upload',
        path,
        file,
        opts,
      });
    });
  }

  async deleteFile(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storage.subscribe((msg: any) => {
        if (msg.type === 'storage:delete-complete' && msg.path === path) {
          resolve();
        }
        if (msg.type === 'storage:error' && msg.operation === 'delete') {
          reject(msg.error);
        }
      });

      this.storage.receive({
        type: 'storage:delete',
        path,
      });
    });
  }

  // ======================
  // Lifecycle API
  // ======================

  shutdown(): void {
    this.connection.receive({ type: 'connection:shutdown' });
  }

  subscribeConnectionStatus(cb: (status: any) => void): () => void {
    this.connection.subscribe((msg: any) => {
      if (msg.type === 'connection:status') {
        cb(msg.status);
      }
    });

    return () => {
      // Unsubscribe handled by actor
    };
  }
}
