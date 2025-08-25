# InstantDB Node.js Package Implementation Plan

## Overview

This plan outlines the creation of `@instantdb/node`, a Node.js-specific package for InstantDB that maintains API compatibility with the core package while adapting browser-specific functionality for server environments.

## Architecture Analysis

### Core Package Structure
The InstantDB core package (`@instantdb/core`) is built with the following key components:

1. **Reactor.js** - The main engine that handles:
   - WebSocket connections for real-time updates
   - Query subscriptions and mutations
   - Authentication state management
   - Presence and room functionality
   - Local state persistence

2. **Storage Layer**:
   - `IndexedDBStorage.js` - Browser-specific persistent storage
   - `InMemoryStorage.js` - Fallback storage implementation

3. **Network Layer**:
   - `WindowNetworkListener.js` - Browser-specific network status detection
   - WebSocket connections for real-time communication

4. **Query System**:
   - `instaql.js` - Query execution engine
   - `store.js` - Triple store for local data
   - `datalog.js` - Datalog query processing

5. **Transaction System**:
   - `instatx.ts` - Transaction builder
   - `instaml.js` - Transaction transformation

## Key Adaptations for Node.js

### 1. Storage Implementation
**Browser**: Uses IndexedDB for persistence
**Node.js**: Need to implement file-based or database-backed storage

Options:
- SQLite for embedded database storage
- File system with JSON storage
- LevelDB for key-value storage
- In-memory storage with optional persistence

### 2. Network Listener
**Browser**: Uses `navigator.onLine` and window events
**Node.js**: Need to implement network connectivity detection

Options:
- DNS lookups to check connectivity
- HTTP health checks
- Assume always online for server environments

### 3. WebSocket Implementation
**Browser**: Uses native WebSocket API
**Node.js**: Need to use `ws` package or similar

### 4. Global Objects
**Browser**: Uses `window`, `navigator`, `addEventListener`
**Node.js**: Need to handle missing globals or provide polyfills

### 5. Authentication Storage
**Browser**: Can use localStorage, sessionStorage, or IndexedDB
**Node.js**: Need secure storage for auth tokens

## Implementation Strategy

### Package Structure
```
client/packages/node/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                 # Main entry point
│   ├── NodeReactor.js           # Extended Reactor for Node.js
│   ├── storage/
│   │   ├── FileSystemStorage.js # File-based storage
│   │   └── SQLiteStorage.js     # SQLite storage option
│   ├── network/
│   │   └── NodeNetworkListener.js
│   ├── websocket/
│   │   └── NodeWebSocket.js     # WebSocket wrapper for Node.js
│   └── auth/
│       └── NodeAuthStorage.js    # Secure auth token storage
└── __tests__/
    └── ... test files ...
```

### Core Modifications

1. **Conditional Imports**: The core package checks `isClient()` to determine if it's running in a browser. We'll need to ensure this returns false in Node.js.

2. **Storage Adapter**: Create a storage interface that can be implemented by different backends:
   ```javascript
   class NodeFileSystemStorage {
     constructor(dbPath) {
       this.dbPath = dbPath;
     }
     
     async getItem(key) {
       // Read from file system
     }
     
     async setItem(key, value) {
       // Write to file system
     }
   }
   ```

3. **Network Listener**: Implement a Node.js-compatible network listener:
   ```javascript
   class NodeNetworkListener {
     static async getIsOnline() {
       // Implement network check
       return true; // Or actual network check
     }
     
     static listen(callback) {
       // Implement network status monitoring
     }
   }
   ```

4. **WebSocket Handling**: Use the `ws` package for WebSocket connections:
   ```javascript
   import WebSocket from 'ws';
   
   function createWebSocket(uri) {
     return new WebSocket(uri);
   }
   ```

### API Compatibility

The Node.js package must maintain 100% API compatibility with the core package:

```javascript
import { init } from '@instantdb/node';

const db = init({
  appId: 'your-app-id',
  // Optional: specify storage backend
  storage: 'sqlite', // or 'filesystem', 'memory'
  storagePath: './instant-db' // for file/sqlite storage
});

// Query API - identical to core
db.subscribeQuery({ users: {} }, (result) => {
  console.log(result.data);
});

// Transaction API - identical to core
db.transact(
  db.tx.users[id()].update({ name: 'Alice' })
);

// Auth API - identical to core
db.auth.signInWithToken(token);
```

### Environment-Specific Features

1. **Server-Side Rendering (SSR)**: 
   - Ensure the package works in SSR contexts
   - Handle hydration properly
   - Provide methods to serialize/deserialize state

2. **Long-Running Processes**:
   - Implement connection pooling
   - Handle reconnection logic for server environments
   - Memory management for long-running subscriptions

3. **Multi-Tenant Support**:
   - Allow multiple database instances
   - Isolated storage per instance
   - Efficient resource sharing

## Testing Strategy

1. **Unit Tests**: Test each component in isolation
2. **Integration Tests**: Test the full query/subscription flow
3. **Compatibility Tests**: Ensure API compatibility with core
4. **Performance Tests**: Benchmark against core package
5. **Environment Tests**: Test in various Node.js versions

## Migration Path

For users migrating from browser to Node.js:

1. **Drop-in Replacement**: 
   ```javascript
   // Before (browser)
   import { init } from '@instantdb/core';
   
   // After (Node.js)
   import { init } from '@instantdb/node';
   ```

2. **Configuration Options**: Provide Node.js-specific options while maintaining compatibility

3. **Documentation**: Clear migration guide and API reference

## Deliverables

1. **Package Implementation**: Full Node.js package with all core functionality
2. **Tests**: Comprehensive test suite
3. **Documentation**: API docs, migration guide, examples
4. **Examples**: Sample Node.js applications using the package
5. **Performance Benchmarks**: Comparison with core package

## Success Criteria

1. **API Compatibility**: 100% compatible with @instantdb/core API
2. **Functionality**: All query and subscription features work identically
3. **Performance**: Comparable or better performance than browser version
4. **Stability**: Robust error handling and reconnection logic
5. **Developer Experience**: Easy to install and use with clear documentation

## Next Steps

1. Set up the package structure and build configuration
2. Implement storage adapters starting with file system
3. Create Node.js-specific network and WebSocket implementations
4. Integrate with core Reactor functionality
5. Add comprehensive tests
6. Create documentation and examples
7. Performance optimization and testing
8. Publish to npm registry