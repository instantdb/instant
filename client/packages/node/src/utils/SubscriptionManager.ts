// Define Unsubscribe type locally since it's not exported from core
type Unsubscribe = () => void;

interface SubscriptionInfo {
  unsubscribe: Unsubscribe;
  createdAt: number;
  lastActivity: number;
  queryKey: string;
}

export class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private maxSubscriptionAge: number;
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(maxSubscriptionAge: number = 60 * 60 * 1000) { // 1 hour default
    this.maxSubscriptionAge = maxSubscriptionAge;
    this.startCleanupInterval();
  }
  
  private startCleanupInterval() {
    // Clean up old subscriptions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSubscriptions();
    }, 5 * 60 * 1000);
  }
  
  private cleanupOldSubscriptions() {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [id, info] of this.subscriptions.entries()) {
      if (now - info.createdAt > this.maxSubscriptionAge) {
        toRemove.push(id);
      }
    }
    
    for (const id of toRemove) {
      this.unsubscribe(id);
      console.log(`[SubscriptionManager] Cleaned up old subscription: ${id}`);
    }
  }
  
  add(id: string, unsubscribe: Unsubscribe, queryKey: string): void {
    const now = Date.now();
    this.subscriptions.set(id, {
      unsubscribe,
      createdAt: now,
      lastActivity: now,
      queryKey,
    });
  }
  
  updateActivity(id: string): void {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.lastActivity = Date.now();
    }
  }
  
  unsubscribe(id: string): void {
    const sub = this.subscriptions.get(id);
    if (sub) {
      try {
        sub.unsubscribe();
      } catch (error) {
        console.error(`[SubscriptionManager] Error unsubscribing ${id}:`, error);
      }
      this.subscriptions.delete(id);
    }
  }
  
  unsubscribeAll(): void {
    for (const [id] of this.subscriptions.entries()) {
      this.unsubscribe(id);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
  
  getStats() {
    const now = Date.now();
    return {
      activeSubscriptions: this.subscriptions.size,
      subscriptions: Array.from(this.subscriptions.entries()).map(([id, info]) => ({
        id,
        queryKey: info.queryKey,
        age: now - info.createdAt,
        idleTime: now - info.lastActivity,
        createdAt: new Date(info.createdAt).toISOString(),
        lastActivity: new Date(info.lastActivity).toISOString(),
      })),
    };
  }
}

// Create a global subscription manager
export const globalSubscriptionManager = new SubscriptionManager();

// Clean up on process exit
process.on('exit', () => {
  globalSubscriptionManager.unsubscribeAll();
});