import { BaseActor, Message } from './BaseActor.js';
import { Deferred } from '../utils/Deferred.js';

export interface Mutation {
  op: 'transact';
  'tx-steps': any[];
  created: number;
  error?: any;
  order: number;
  'tx-id'?: number;
  confirmed?: number;
}

export type MutationStatus = 'enqueued' | 'pending' | 'synced' | 'timeout' | 'error';

interface MutationState {
  pending: Map<string, Mutation>;
  deferreds: Map<string, Deferred>;
}

/**
 * MutationActor manages pending mutations and optimistic updates.
 *
 * Receives:
 * - { type: 'mutation:push', txSteps: any[], error?: any }
 * - { type: 'ws:transact-ok', payload }
 * - { type: 'mutation:error', eventId, error }
 * - { type: 'mutation:timeout', eventId }
 * - { type: 'mutation:cleanup', processedTxId }
 *
 * Publishes:
 * - { type: 'connection:send', eventId, message }
 * - { type: 'mutation:status', eventId, status, error? }
 * - { type: 'mutation:synced', eventId, txId }
 * - { type: 'query:notify-all' } -> trigger query recomputation
 */
export class MutationActor extends BaseActor<MutationState> {
  private isOnline: boolean = true;
  private isAuthenticated: boolean = false;

  constructor() {
    super('Mutation', {
      pending: new Map(),
      deferreds: new Map(),
    });
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'mutation:push':
        this.handlePush(message.txSteps, message.error);
        break;

      case 'ws:transact-ok':
        this.handleTransactOk(message.payload);
        break;

      case 'mutation:error':
        this.handleMutationError(message.eventId, message.error, 'error');
        break;

      case 'mutation:timeout':
        this.handleMutationError(message.eventId, { message: 'Transaction timed out' }, 'timeout');
        break;

      case 'mutation:cleanup':
        this.cleanupProcessed(message.processedTxId);
        break;

      case 'connection:status':
        if (message.status === 'authenticated') {
          this.isAuthenticated = true;
          this.flushPendingMutations();
        } else {
          this.isAuthenticated = false;
        }
        break;

      case 'network:status':
        this.isOnline = message.isOnline;
        break;
    }
  }

  private handlePush(txSteps: any[], error?: any): string {
    const eventId = this.generateEventId();
    const mutations = Array.from(this.state.pending.values());
    const order = Math.max(0, ...mutations.map((m) => m.order || 0)) + 1;

    const mutation: Mutation = {
      op: 'transact',
      'tx-steps': txSteps,
      created: Date.now(),
      error,
      order,
    };

    this.state.pending.set(eventId, mutation);

    const dfd = new Deferred();
    this.state.deferreds.set(eventId, dfd);

    // Publish the deferred so caller can await it
    this.publish({
      type: 'mutation:deferred',
      eventId,
      deferred: dfd,
    });

    // Publish that mutation was pushed
    this.publish({
      type: 'mutation:pushed',
      eventId,
    });

    this.sendMutation(eventId, mutation);

    // Notify queries to recompute with optimistic update
    this.publish({ type: 'query:notify-all' });

    return eventId;
  }

  private sendMutation(eventId: string, mutation: Mutation): void {
    if (mutation.error) {
      this.handleMutationError(eventId, { message: mutation.error.message }, 'error');
      return;
    }

    if (!this.isAuthenticated) {
      this.finishTransaction('enqueued', eventId);
      return;
    }

    if (!this.isOnline) {
      this.finishTransaction('enqueued', eventId);
      return;
    }

    const timeoutMs = Math.max(5000, this.state.pending.size * 5000);

    // Send to server
    this.publish({
      type: 'connection:send',
      eventId,
      message: mutation,
    });

    // Set timeout
    setTimeout(() => {
      if (!this.isOnline) return;

      const mut = this.state.pending.get(eventId);
      if (mut && !mut['tx-id']) {
        this.handleMutationError(eventId, { message: 'Transaction timed out' }, 'timeout');
      }
    }, timeoutMs);
  }

  private handleTransactOk(payload: any): void {
    const eventId = payload['client-event-id'];
    const txId = payload['tx-id'];

    const mutation = this.state.pending.get(eventId);
    if (!mutation) return;

    // Update with server tx-id
    mutation['tx-id'] = txId;
    mutation.confirmed = Date.now();

    this.finishTransaction('synced', eventId);

    this.publish({
      type: 'mutation:synced',
      eventId,
      txId,
    });
  }

  private handleMutationError(eventId: string, error: any, status: 'error' | 'timeout'): void {
    const mutation = this.state.pending.get(eventId);

    if (mutation && (status !== 'timeout' || !mutation['tx-id'])) {
      this.state.pending.delete(eventId);

      this.publish({ type: 'query:notify-all' });

      this.finishTransaction(status, eventId, error);
    }
  }

  private finishTransaction(
    status: MutationStatus,
    eventId: string,
    errorMsg?: any,
  ): void {
    const dfd = this.state.deferreds.get(eventId);
    this.state.deferreds.delete(eventId);

    const ok = status !== 'error' && status !== 'timeout';

    if (!dfd && !ok) {
      console.error('Mutation failed', { status, eventId, ...errorMsg });
    }

    if (!dfd) return;

    if (ok) {
      dfd.resolve({ status, eventId });
    } else {
      dfd.reject(new Error(errorMsg?.message || 'Transaction failed'));
    }

    this.publish({
      type: 'mutation:status',
      eventId,
      status,
      error: errorMsg,
    });
  }

  private cleanupProcessed(processedTxId?: number): void {
    if (!processedTxId) return;

    for (const [eventId, mut] of Array.from(this.state.pending.entries())) {
      if (mut['tx-id'] && mut['tx-id'] <= processedTxId) {
        this.state.pending.delete(eventId);
      }
    }
  }

  private flushPendingMutations(): void {
    const sorted = Array.from(this.state.pending.entries()).sort(
      ([_, a], [__, b]) => (a.order || 0) - (b.order || 0),
    );

    for (const [eventId, mut] of sorted) {
      if (!mut['tx-id']) {
        this.sendMutation(eventId, mut);
      }
    }
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for testing
  getPendingMutations(): Map<string, Mutation> {
    return new Map(this.state.pending);
  }

  hasPendingMutation(eventId: string): boolean {
    return this.state.pending.has(eventId);
  }
}
