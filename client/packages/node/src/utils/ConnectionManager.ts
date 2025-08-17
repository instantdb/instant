import { InstantCoreDatabase } from '@instantdb/core';

interface ConnectionOptions {
  maxIdleTime?: number; // Maximum idle time before closing connection (ms)
  reconnectInterval?: number; // Interval between reconnection attempts (ms)
  maxReconnectAttempts?: number; // Maximum number of reconnection attempts
}

export class ConnectionManager {
  private connections: Map<string, {
    db: InstantCoreDatabase<any, any>;
    lastActivity: number;
    reconnectAttempts: number;
  }> = new Map();
  
  private options: Required<ConnectionOptions>;
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(options: ConnectionOptions = {}) {
    this.options = {
      maxIdleTime: options.maxIdleTime ?? 30 * 60 * 1000, // 30 minutes default
      reconnectInterval: options.reconnectInterval ?? 5000, // 5 seconds default
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  private startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // Check every minute
  }
  
  private cleanupIdleConnections() {
    const now = Date.now();
    for (const [key, conn] of this.connections.entries()) {
      if (now - conn.lastActivity > this.options.maxIdleTime) {
        this.closeConnection(key);
      }
    }
  }
  
  addConnection(key: string, db: InstantCoreDatabase<any, any>) {
    this.connections.set(key, {
      db,
      lastActivity: Date.now(),
      reconnectAttempts: 0,
    });
  }
  
  getConnection(key: string): InstantCoreDatabase<any, any> | undefined {
    const conn = this.connections.get(key);
    if (conn) {
      conn.lastActivity = Date.now();
      return conn.db;
    }
    return undefined;
  }
  
  closeConnection(key: string) {
    const conn = this.connections.get(key);
    if (conn) {
      conn.db.shutdown();
      this.connections.delete(key);
    }
  }
  
  closeAllConnections() {
    for (const [key] of this.connections.entries()) {
      this.closeConnection(key);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
  
  // Get connection statistics
  getStats() {
    return {
      activeConnections: this.connections.size,
      connections: Array.from(this.connections.entries()).map(([key, conn]) => ({
        key,
        lastActivity: new Date(conn.lastActivity).toISOString(),
        idleTime: Date.now() - conn.lastActivity,
        reconnectAttempts: conn.reconnectAttempts,
      })),
    };
  }
}

// Global connection manager instance
export const globalConnectionManager = new ConnectionManager();

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down InstantDB connections...');
  globalConnectionManager.closeAllConnections();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nGracefully shutting down InstantDB connections...');
  globalConnectionManager.closeAllConnections();
  process.exit(0);
});