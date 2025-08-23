import { EventEmitter } from 'events';

interface NetworkListener {
  isOnline(): boolean;
  listen(cb: () => void): () => void;
}

export class NodeNetworkListener extends EventEmitter implements NetworkListener {
  private online: boolean = true;
  private callbacks: Set<() => void> = new Set();

  constructor() {
    super();
    // In Node.js, we'll assume we're always online by default
    // This can be enhanced later with actual network checking
    this.online = true;
  }

  isOnline(): boolean {
    return this.online;
  }

  listen(cb: () => void): () => void {
    this.callbacks.add(cb);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(cb);
    };
  }

  // Method to manually set online status (useful for testing)
  setOnline(online: boolean): void {
    if (this.online !== online) {
      this.online = online;
      // Notify all listeners
      this.callbacks.forEach(cb => cb());
    }
  }
}

// Factory function to match the core package's WindowNetworkListener interface
export function createNodeNetworkListener(): NetworkListener {
  return new NodeNetworkListener();
}