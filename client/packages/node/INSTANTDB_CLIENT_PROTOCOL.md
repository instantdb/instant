# InstantDB Client Implementation Protocol

Based on the experience of creating the Node.js client, this document outlines the protocol and considerations for implementing an InstantDB client in any language.

## Overview

InstantDB clients are platform-specific implementations of a common protocol that enables real-time data synchronization, offline support, and reactive queries. The core architecture is based on a Reactor pattern with WebSocket communication.

## Core Architecture

### 1. Reactor Pattern
- Central component that manages all state and communication
- Handles WebSocket messages, query subscriptions, and transactions
- Maintains local cache and handles optimistic updates

### 2. Message Protocol
The client communicates with the InstantDB backend via WebSocket using these message types:

#### Client → Server Messages:
- `init`: Initial handshake with session ID
- `add-query`: Subscribe to a query
- `remove-query`: Unsubscribe from a query
- `transact`: Send a transaction
- `refresh-token`: Refresh authentication token

#### Server → Client Messages:
- `init-ok`: Handshake acknowledged
- `add-query-ok`: Query subscription confirmed
- `query-result`: Query data update
- `tx-ok`: Transaction acknowledged
- `error`: Error response

## Essential Components

### 1. Platform Adapters

Every InstantDB client must implement these four adapters:

#### A. Storage Adapter
```
Interface StorageAdapter {
  - getItem(key: string): Promise<string | null>
  - setItem(key: string, value: string): Promise<void>
  - removeItem(key: string): Promise<void>
  - clear(): Promise<void>
}
```
- **Browser**: IndexedDB
- **Node.js**: File system (~/.instantdb/{appId}/)
- **Swift/iOS**: CoreData, UserDefaults, or SQLite
- **Android**: SharedPreferences or Room

#### B. WebSocket Adapter
```
Interface WebSocketAdapter {
  - connect(url: string): void
  - send(message: string): void
  - close(): void
  - onOpen(handler: Function): void
  - onMessage(handler: Function): void
  - onError(handler: Function): void
  - onClose(handler: Function): void
}
```
- **Browser**: Native WebSocket API
- **Node.js**: 'ws' package
- **Swift/iOS**: URLSessionWebSocketTask or Starscream
- **Android**: OkHttp WebSocket

#### C. Network Status Adapter
```
Interface NetworkAdapter {
  - isOnline(): boolean
  - subscribe(handler: Function): Unsubscribe
}
```
- **Browser**: navigator.onLine + online/offline events
- **Node.js**: Custom implementation (can default to always online)
- **Swift/iOS**: NWPathMonitor
- **Android**: ConnectivityManager

#### D. Auth Storage Adapter
```
Interface AuthStorageAdapter {
  - getToken(): Promise<string | null>
  - setToken(token: string): Promise<void>
  - clearToken(): Promise<void>
}
```
- **Browser**: localStorage or IndexedDB
- **Node.js**: Encrypted file storage
- **Swift/iOS**: Keychain Services
- **Android**: EncryptedSharedPreferences

### 2. Core Modules

#### A. Query Engine
- Parse InstaQL queries into internal format
- Manage active subscriptions
- Handle query results and merge with local cache
- Implement optimistic updates

#### B. Transaction System
- Build transaction objects with operations
- Queue transactions for sending
- Handle optimistic updates
- Manage rollback on failure

#### C. Cache Manager
- Store query results locally
- Implement cache invalidation
- Handle offline queue
- Merge server updates with local state

#### D. Auth Manager
- Handle authentication flow
- Manage token lifecycle
- Emit auth state changes

## Implementation Steps

### Step 1: Define Core Types
```swift
// Example in Swift
struct InstaQLQuery {
    let namespace: String
    let where: [String: Any]?
    let include: [String: InstaQLQuery]?
}

struct Transaction {
    let id: String
    let operations: [Operation]
}

enum Operation {
    case create(namespace: String, id: String, data: [String: Any])
    case update(namespace: String, id: String, data: [String: Any])
    case delete(namespace: String, id: String)
    case link(namespace: String, id: String, relation: String, targetId: String)
}
```

### Step 2: Implement Adapters
Create platform-specific implementations of the four core adapters.

### Step 3: Build the Reactor
```swift
class Reactor {
    private let storage: StorageAdapter
    private let websocket: WebSocketAdapter
    private let network: NetworkAdapter
    private let authStorage: AuthStorageAdapter
    
    func connect() { }
    func subscribeQuery(_ query: InstaQLQuery, handler: @escaping (Result) -> Void) -> Cancellable { }
    func transact(_ transaction: Transaction) async throws { }
}
```

### Step 4: Create High-Level API
```swift
public class InstantDB {
    private let reactor: Reactor
    
    public func query<T: Decodable>(_ query: Query) async throws -> QueryResult<T> { }
    public func subscribe<T: Decodable>(_ query: Query, handler: @escaping (QueryResult<T>) -> Void) -> Cancellable { }
    public func transact(_ builder: TransactionBuilder) async throws { }
}
```

## Key Challenges

### 1. Type System Mapping
- InstantDB uses a flexible schema system
- Map JavaScript/TypeScript types to target language
- Handle nullable fields and relationships

### 2. Reactive Programming
- Implement subscription pattern
- Handle cleanup to prevent memory leaks
- Consider using language-specific reactive frameworks

### 3. Offline Support
- Queue transactions when offline
- Sync when connection restored
- Handle conflict resolution

### 4. Performance
- Efficient cache implementation
- Minimize memory usage
- Optimize WebSocket message parsing

## Platform-Specific Considerations

### iOS/Swift
- Background execution limits
- App lifecycle (suspension/resumption)
- Network entitlements
- SwiftUI integration (@ObservedObject, @Published)

### Android
- Service lifecycle
- Doze mode and battery optimization
- ProGuard/R8 configuration
- Kotlin coroutines integration

### Web
- Browser storage limits
- Service Worker integration
- Cross-tab synchronization
- Bundle size optimization

## Testing Strategy

1. **Unit Tests**
   - Test each adapter independently
   - Mock WebSocket communication
   - Test cache operations

2. **Integration Tests**
   - Test with real InstantDB backend
   - Multi-client synchronization
   - Offline/online transitions

3. **Platform Tests**
   - Background behavior
   - Memory usage
   - Performance benchmarks

## Wire Format Examples

### Query Subscription
```json
{
  "op": "add-query",
  "q": {
    "users": {
      "$": {
        "where": {
          "age": { "$gte": 18 }
        }
      }
    }
  },
  "client-event-id": "uuid-here"
}
```

### Transaction
```json
{
  "op": "transact",
  "tx-steps": [
    ["add-triple", "user-id", "users/name", "John Doe"],
    ["add-triple", "user-id", "users/email", "john@example.com"]
  ],
  "client-event-id": "uuid-here"
}
```

## Conclusion

Creating an InstantDB client requires implementing platform-specific adapters while maintaining compatibility with the core protocol. The key is to abstract platform differences behind clean interfaces while preserving the reactive, real-time nature of InstantDB.