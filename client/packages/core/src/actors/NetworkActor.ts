import { BaseActor, Message } from './BaseActor.js';

export interface NetworkListener {
  getIsOnline(): Promise<boolean>;
  listen(callback: (isOnline: boolean) => void): () => void;
}

interface NetworkState {
  isOnline: boolean;
}

/**
 * NetworkActor monitors network connectivity.
 *
 * Publishes:
 * - { type: 'network:online' }
 * - { type: 'network:offline' }
 * - { type: 'network:status', isOnline: boolean }
 */
export class NetworkActor extends BaseActor<NetworkState> {
  private networkListener: NetworkListener;
  private unlistenNetwork?: () => void;

  constructor(networkListener: NetworkListener) {
    super('Network', { isOnline: true });
    this.networkListener = networkListener;
  }

  async initialize(): Promise<void> {
    // Get initial online status
    const isOnline = await this.networkListener.getIsOnline();
    this.state = { isOnline };

    // Listen for changes
    this.unlistenNetwork = this.networkListener.listen((isOnline) => {
      // Avoid duplicate events
      if (isOnline === this.state.isOnline) {
        return;
      }

      this.state = { isOnline };

      // Publish appropriate message
      this.publish({
        type: isOnline ? 'network:online' : 'network:offline',
      });

      this.publish({
        type: 'network:status',
        isOnline,
      });
    });
  }

  receive(message: Message): void {
    if (message.type === 'network:query') {
      this.publish({
        type: 'network:status',
        isOnline: this.state.isOnline,
      });
    }
  }

  isOnline(): boolean {
    return this.state.isOnline;
  }

  shutdown(): void {
    super.shutdown();
    if (this.unlistenNetwork) {
      this.unlistenNetwork();
    }
  }
}
