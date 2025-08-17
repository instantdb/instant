# @instantdb/node

The official Node.js client for [Instant](https://instantdb.com), a modern database for real-time sync.

## Installation

```bash
npm install @instantdb/node
# or
yarn add @instantdb/node
# or
pnpm add @instantdb/node
```

## Quick Start

```typescript
import { init } from '@instantdb/node';

// Initialize the client
const db = init({
  appId: 'your-app-id',
});

// Subscribe to data
db.subscribeQuery({ users: {} }, (result) => {
  if (result.error) {
    console.error('Query error:', result.error);
    return;
  }
  console.log('Users:', result.data.users);
});

// Make transactions
const userId = crypto.randomUUID();
await db.transact(
  db.tx.users[userId].update({
    name: 'Alice',
    email: 'alice@example.com',
  })
);
```

## Features

- 🔄 **Real-time sync** - Changes sync instantly across all connected clients
- 📊 **Relational queries** - Query related data in a single request
- 🔐 **Authentication** - Built-in auth with magic links and OAuth providers
- 💾 **Offline support** - Local persistence with file system storage
- 🚀 **Optimistic updates** - Instant UI updates with automatic conflict resolution
- 🔒 **Type-safe** - Full TypeScript support with schema inference

## Schema Definition

Define your schema for type safety and auto-completion:

```typescript
import { init } from '@instantdb/node';
import schema from './instant.schema';

const db = init({
  appId: 'your-app-id',
  schema,
});

// Now your queries are fully typed!
db.subscribeQuery({ users: { posts: {} } }, (result) => {
  // TypeScript knows the shape of users and posts
});
```

## Authentication

```typescript
// Send a magic link
await db.auth.sendMagicCode({ email: 'user@example.com' });

// Verify the code
await db.auth.signInWithMagicCode({ 
  email: 'user@example.com', 
  code: '123456' 
});

// Sign out
await db.auth.signOut();

// Listen to auth state
db.subscribeAuth((auth) => {
  if (auth.user) {
    console.log('Logged in as:', auth.user.email);
  } else {
    console.log('Logged out');
  }
});
```

## Transactions

```typescript
// Create
const id = crypto.randomUUID();
await db.transact(
  db.tx.todos[id].update({
    title: 'Buy milk',
    completed: false,
  })
);

// Update
await db.transact(
  db.tx.todos[id].update({ completed: true })
);

// Delete
await db.transact(
  db.tx.todos[id].delete()
);

// Link entities
const userId = crypto.randomUUID();
const postId = crypto.randomUUID();
await db.transact([
  db.tx.users[userId].update({ name: 'Alice' }),
  db.tx.posts[postId].update({ title: 'Hello World' }),
  db.tx.users[userId].link({ posts: postId }),
]);
```

## Queries

```typescript
// Basic query
db.subscribeQuery({ users: {} }, (result) => {
  console.log(result.data.users);
});

// With filters
db.subscribeQuery({
  users: {
    $: {
      where: {
        age: { $gte: 18 },
      },
    },
  },
}, (result) => {
  console.log('Adult users:', result.data.users);
});

// With relationships
db.subscribeQuery({
  users: {
    posts: {
      comments: {},
    },
  },
}, (result) => {
  // Access nested data
  result.data.users.forEach(user => {
    user.posts.forEach(post => {
      console.log(`${post.title} has ${post.comments.length} comments`);
    });
  });
});

// One-time query
const result = await db.queryOnce({ users: {} });
console.log(result.data.users);
```

## Presence & Rooms

```typescript
// Join a room
const room = db.joinRoom('chat-room', 'room-123', {
  initialPresence: {
    name: 'Alice',
    status: 'online',
  },
});

// Subscribe to presence
room.subscribePresence({}, (presence) => {
  console.log('Online users:', presence.peers);
});

// Publish presence updates
room.publishPresence({ status: 'away' });

// Subscribe to topics
room.subscribeTopic('typing', (data, peer) => {
  console.log(`${peer.name} is typing: ${data.message}`);
});

// Publish to topics
room.publishTopic('typing', { message: 'Hello...' });

// Leave room
room.leaveRoom();
```

## Storage

```typescript
// Upload a file
const file = await fs.readFile('./photo.jpg');
const result = await db.storage.uploadFile('photos/profile.jpg', file);
console.log('Uploaded:', result.url);

// Delete a file
await db.storage.delete('photos/profile.jpg');
```

## Node.js Specific Features

### File System Storage

Data is persisted to the file system in `~/.instantdb/<app-id>/`:

```typescript
// Data is automatically persisted and restored across restarts
const db = init({ appId: 'your-app-id' });
```

### Secure Token Storage

Authentication tokens are encrypted and stored securely:

```typescript
// Tokens persist across process restarts
await db.auth.signInWithToken(token);
// User remains authenticated after restart
```

### Long-Running Processes

The Node.js client is optimized for server environments with built-in connection pooling and memory management:

```typescript
import { init, subscribeQuery, getConnectionStats, shutdown } from '@instantdb/node';

const db = init({ appId: 'your-app-id' });

// Use production-ready subscription wrapper
const unsubscribe = subscribeQuery(
  db,
  { users: {} },
  (result) => {
    console.log('Users:', result.data.users);
  },
  'user-subscription' // Optional subscription ID
);

// Monitor connection health
setInterval(() => {
  const stats = getConnectionStats();
  console.log('Active connections:', stats.connections.activeConnections);
  console.log('Active subscriptions:', stats.subscriptions.activeSubscriptions);
}, 60000);

// Graceful shutdown
process.on('SIGTERM', () => {
  shutdown(); // Closes all connections and cleans up resources
  process.exit(0);
});
```

### Production Features

#### Connection Management

- **Automatic connection pooling**: Reuses existing connections for the same app
- **Idle connection cleanup**: Automatically closes idle connections after 30 minutes
- **Connection statistics**: Monitor active connections and their health

```typescript
import { getConnectionStats, closeConnection } from '@instantdb/node';

// Get detailed connection statistics
const stats = getConnectionStats();
console.log(stats.connections);

// Manually close a specific app's connections
closeConnection('your-app-id');
```

#### Subscription Management

- **Automatic cleanup**: Old subscriptions are cleaned up after 1 hour
- **Memory leak prevention**: Prevents accumulation of unused subscriptions
- **Activity tracking**: Monitors subscription usage patterns

```typescript
// Production-ready subscription with automatic cleanup
const unsubscribe = subscribeQuery(
  db,
  { posts: { $: { limit: 100 } } },
  (result) => {
    // Handle updates
  },
  'posts-feed' // Named subscription for easier debugging
);

// Unsubscribe when done
unsubscribe();
```

#### Resource Cleanup

- **Graceful shutdown**: Clean shutdown of all connections and subscriptions
- **Process exit handlers**: Automatic cleanup on SIGINT/SIGTERM
- **Memory management**: Prevents memory leaks in long-running processes

```typescript
import { shutdown } from '@instantdb/node';

// Manual shutdown
shutdown();

// Automatic cleanup on process exit
// (handled automatically, no code needed)
```

## Examples

### Express.js Integration

```typescript
import express from 'express';
import { init } from '@instantdb/node';

const app = express();
const db = init({ appId: 'your-app-id' });

app.get('/api/users', async (req, res) => {
  const result = await db.queryOnce({ users: {} });
  res.json(result.data.users);
});

app.post('/api/users', async (req, res) => {
  const id = crypto.randomUUID();
  await db.transact(
    db.tx.users[id].update(req.body)
  );
  res.json({ id });
});
```

### Real-time Sync Between Instances

```typescript
// Instance 1
const db1 = init({ appId: 'your-app-id' });
db1.subscribeQuery({ messages: {} }, (result) => {
  console.log('Instance 1:', result.data.messages);
});

// Instance 2 (could be on another server)
const db2 = init({ appId: 'your-app-id' });
await db2.transact(
  db2.tx.messages[id].update({ text: 'Hello from Instance 2!' })
);
// Instance 1 will receive the update in real-time
```

## API Reference

The Node.js client implements the same API as the browser client. See the [full documentation](https://instantdb.com/docs) for detailed API reference.

## Differences from Browser Client

- **Storage**: Uses file system instead of IndexedDB
- **Network**: Always assumes online status (configurable)
- **WebSocket**: Uses the `ws` package instead of browser WebSocket
- **Auth Storage**: Encrypted file storage for tokens
- **No OAuth redirects**: Use token-based auth for server environments

## License

MIT