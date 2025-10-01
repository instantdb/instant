import { BaseActor, Message } from './BaseActor.js';
import weakHash from '../utils/weakHash.js';
import { Deferred } from '../utils/Deferred.js';

export interface QueryResult {
  store: any;
  pageInfo?: any;
  aggregate?: any;
  processedTxId?: number;
}

export interface QuerySubscription {
  q: any;
  result: QueryResult | null;
  eventId: string;
  lastAccessed: number;
}

interface QueryCallback {
  q: any;
  cb: (data: any) => void;
}

interface QueryOnceDeferred {
  q: any;
  eventId: string;
  dfd: Deferred;
}

interface QueryState {
  subscriptions: Map<string, QuerySubscription>;
  callbacks: Map<string, QueryCallback[]>;
  onceDeferreds: Map<string, QueryOnceDeferred[]>;
  dataCache: Map<string, any>;
}

/**
 * QueryActor manages query subscriptions and results.
 *
 * Receives:
 * - { type: 'query:subscribe', q: any, cb: (data) => void }
 * - { type: 'query:unsubscribe', q: any, cb: (data) => void }
 * - { type: 'query:once', q: any } -> returns promise via deferred
 * - { type: 'ws:add-query-ok', payload: { q, result } }
 * - { type: 'ws:add-query-exists' }
 * - { type: 'mutation:optimistic-update' } -> recompute queries
 *
 * Publishes:
 * - { type: 'connection:send', eventId, message } -> to send add-query
 * - { type: 'query:result', hash, data } -> notify subscribers
 * - { type: 'query:error', hash, error } -> notify of errors
 */
export class QueryActor extends BaseActor<QueryState> {
  private queryCacheLimit: number;

  constructor(queryCacheLimit: number = 10) {
    super('Query', {
      subscriptions: new Map(),
      callbacks: new Map(),
      onceDeferreds: new Map(),
      dataCache: new Map(),
    });
    this.queryCacheLimit = queryCacheLimit;
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'query:subscribe':
        this.handleSubscribe(message.q, message.cb, message.opts);
        break;

      case 'query:unsubscribe':
        this.handleUnsubscribe(message.q, message.cb);
        break;

      case 'query:once':
        this.handleQueryOnce(message.q, message.dfd);
        break;

      case 'ws:add-query-ok':
        this.handleQueryResult(message.payload);
        break;

      case 'ws:add-query-exists':
        this.handleQueryExists(message.payload);
        break;

      case 'query:set-result':
        this.setQueryResult(message.hash, message.result);
        break;

      case 'query:notify':
        this.notifyOne(message.hash);
        break;

      case 'query:notify-all':
        this.notifyAll();
        break;

      case 'query:error':
        this.handleQueryError(message.q, message.hash, message.eventId, message.error);
        break;

      case 'query:cleanup':
        this.cleanupIfNoListeners(message.q, message.hash);
        break;
    }
  }

  private handleSubscribe(q: any, cb: (data: any) => void, opts?: any): void {
    const hash = weakHash(q);

    // Get previous result if available
    const prevResult = this.state.dataCache.get(hash);
    if (prevResult) {
      cb(prevResult);
    }

    // Add callback
    if (!this.state.callbacks.has(hash)) {
      this.state.callbacks.set(hash, []);
    }
    this.state.callbacks.get(hash)!.push({ q, cb });

    // Start subscription if new
    this.startQuerySub(q, hash);

    // Publish unsubscribe function back (via message)
    this.publish({
      type: 'query:subscribed',
      q,
      hash,
      cb,
    });
  }

  private handleUnsubscribe(q: any, cb: (data: any) => void): void {
    const hash = weakHash(q);
    const cbs = this.state.callbacks.get(hash);

    if (cbs) {
      const filtered = cbs.filter((r) => r.cb !== cb);
      this.state.callbacks.set(hash, filtered);
    }

    this.cleanupIfNoListeners(q, hash);
  }

  private handleQueryOnce(q: any, dfd: Deferred): void {
    const hash = weakHash(q);
    const eventId = this.startQuerySub(q, hash);

    if (!this.state.onceDeferreds.has(hash)) {
      this.state.onceDeferreds.set(hash, []);
    }
    this.state.onceDeferreds.get(hash)!.push({ q, dfd, eventId });

    // Set timeout for queryOnce
    setTimeout(() => {
      dfd.reject(new Error('Query timed out'));
    }, 30000);
  }

  private startQuerySub(q: any, hash: string): string {
    const eventId = this.generateEventId();

    // Create or update subscription
    const existing = this.state.subscriptions.get(hash);
    if (!existing) {
      this.state.subscriptions.set(hash, {
        q,
        result: null,
        eventId,
        lastAccessed: Date.now(),
      });

      // Send query to server
      this.publish({
        type: 'connection:send',
        eventId,
        message: { op: 'add-query', q },
      });
    } else {
      // Update last accessed
      existing.lastAccessed = Date.now();
    }

    return eventId;
  }

  private handleQueryResult(payload: any): void {
    const { q, result } = payload;
    const hash = weakHash(q);
    const sub = this.state.subscriptions.get(hash);

    if (!sub) return;

    // Store result (simplified - in real impl, create store from triples)
    sub.result = {
      store: result, // Simplified
      pageInfo: payload['page-info'],
      aggregate: payload.aggregate,
      processedTxId: payload['processed-tx-id'],
    };

    this.notifyOne(hash);
    this.notifyQueryOnce(hash);
  }

  private handleQueryExists(payload: any): void {
    const hash = weakHash(payload.q);
    this.notifyQueryOnce(hash);
  }

  private handleQueryError(q: any, hash: string, eventId: string, error: any): void {
    // Notify regular callbacks
    this.notifyQueryError(hash, error);

    // Reject queryOnce promises
    const dfds = this.state.onceDeferreds.get(hash);
    if (dfds) {
      const dfd = dfds.find((r) => r.eventId === eventId);
      if (dfd) {
        dfd.dfd.reject(error);
        this.completeQueryOnce(q, hash, dfd.dfd);
      }
    }
  }

  private setQueryResult(hash: string, result: any): void {
    const sub = this.state.subscriptions.get(hash);
    if (sub) {
      sub.result = result;
    }
  }

  private notifyOne(hash: string): void {
    const cbs = this.state.callbacks.get(hash) || [];
    const data = this.computeQueryData(hash);

    if (!data) return;

    // Check if data changed
    const prevData = this.state.dataCache.get(hash);
    if (this.areEqual(data, prevData)) return;

    this.state.dataCache.set(hash, data);

    cbs.forEach((r) => r.cb(data));

    this.publish({
      type: 'query:result',
      hash,
      data,
    });
  }

  private notifyAll(): void {
    for (const hash of this.state.callbacks.keys()) {
      this.notifyOne(hash);
    }
  }

  private notifyQueryOnce(hash: string): void {
    const dfds = this.state.onceDeferreds.get(hash) || [];
    const data = this.computeQueryData(hash);

    dfds.forEach((r) => {
      const sub = this.state.subscriptions.get(hash);
      if (sub) {
        this.completeQueryOnce(r.q, hash, r.dfd);
        r.dfd.resolve(data);
      }
    });
  }

  private notifyQueryError(hash: string, error: any): void {
    const cbs = this.state.callbacks.get(hash) || [];
    cbs.forEach((r) => r.cb({ error }));
  }

  private completeQueryOnce(q: any, hash: string, dfd: Deferred): void {
    const dfds = this.state.onceDeferreds.get(hash);
    if (dfds) {
      const filtered = dfds.filter((r) => r.dfd !== dfd);
      this.state.onceDeferreds.set(hash, filtered);
    }

    this.cleanupIfNoListeners(q, hash);
  }

  private cleanupIfNoListeners(q: any, hash: string): void {
    const hasCbs = (this.state.callbacks.get(hash)?.length || 0) > 0;
    const hasDfds = (this.state.onceDeferreds.get(hash)?.length || 0) > 0;

    if (!hasCbs && !hasDfds) {
      this.state.callbacks.delete(hash);
      this.state.onceDeferreds.delete(hash);

      // Send remove-query to server
      const eventId = this.generateEventId();
      this.publish({
        type: 'connection:send',
        eventId,
        message: { op: 'remove-query', q },
      });
    }
  }

  private computeQueryData(hash: string): any {
    const sub = this.state.subscriptions.get(hash);
    if (!sub || !sub.result) return null;

    // Simplified - real impl would run instaql on store
    return sub.result;
  }

  private areEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for testing/facade
  getSubscription(hash: string): QuerySubscription | undefined {
    return this.state.subscriptions.get(hash);
  }

  hasActiveSubscribers(hash: string): boolean {
    const hasCbs = (this.state.callbacks.get(hash)?.length || 0) > 0;
    const hasDfds = (this.state.onceDeferreds.get(hash)?.length || 0) > 0;
    return hasCbs || hasDfds;
  }
}
