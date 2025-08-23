# InstantDB Node.js Examples

This directory contains examples demonstrating how to use `@instantdb/node` in various scenarios.

## Prerequisites

1. Install dependencies:
```bash
pnpm install
```

2. Get your Instant app ID from [instantdb.com/dash](https://instantdb.com/dash)

3. Replace `'your-app-id'` in the example files with your actual app ID

## Examples

### 1. Basic Example (`basic-example.js`)

Demonstrates core functionality:
- Subscribing to queries
- Creating and updating data
- Authentication state
- Presence and rooms
- Graceful shutdown

Run it:
```bash
npm run basic
```

### 2. Multi-Instance Sync (`multi-instance-sync.js`)

Shows real-time synchronization between multiple Node.js processes:
- Multiple instances communicating via Instant
- Presence tracking to see connected instances
- Real-time message broadcasting
- Colored output for easy differentiation

Run a single instance:
```bash
npm run sync
```

Run three instances simultaneously (in different colors):
```bash
npm run sync:multi
```

Or run instances manually with custom names:
```bash
INSTANCE_NAME=server1 INSTANCE_COLOR="\x1b[32m" node multi-instance-sync.js
INSTANCE_NAME=server2 INSTANCE_COLOR="\x1b[33m" node multi-instance-sync.js
```

### 3. Express.js Integration (`express-integration.js`)

Full REST API built with Express.js and Instant:
- RESTful endpoints for CRUD operations
- Server-Sent Events (SSE) for real-time updates
- Authentication endpoints
- Presence/room management
- Graceful shutdown handling

Run it:
```bash
npm run express
```

Then visit http://localhost:3000/health

API Endpoints:
- `GET /health` - Health check
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user
- `GET /api/users/stream` - SSE endpoint for real-time updates
- `POST /api/presence/:roomId/join` - Join a presence room
- `POST /api/auth/magic-code` - Send magic code
- `POST /api/auth/verify` - Verify magic code

Test with curl:
```bash
# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

# Get all users
curl http://localhost:3000/api/users

# Stream real-time updates
curl http://localhost:3000/api/users/stream
```

## Key Concepts Demonstrated

1. **Persistence**: Data is stored in `~/.instantdb/<app-id>/` and persists across restarts

2. **Real-time Sync**: Changes made in one instance immediately appear in all connected instances

3. **Authentication**: Secure token storage with encryption for Node.js environments

4. **Graceful Shutdown**: Proper cleanup of subscriptions and connections

5. **Server Integration**: How to integrate Instant with existing Node.js frameworks

## Tips

- Use environment variables for configuration in production
- Implement proper error handling and logging
- Consider connection pooling for high-traffic applications
- Monitor memory usage in long-running processes
- Use TypeScript for better type safety

## Troubleshooting

1. **Connection Issues**: Check your app ID and network connectivity
2. **Permission Errors**: Ensure the process has write access to `~/.instantdb/`
3. **Port Conflicts**: Change the PORT environment variable for Express example
4. **Memory Leaks**: Always clean up subscriptions and call `db.shutdown()` on exit

## Next Steps

- Explore the [Instant documentation](https://instantdb.com/docs)
- Join the [Discord community](https://discord.com/invite/VU53p7uQcE)
- Check out more examples in the [GitHub repository](https://github.com/instantdb/instant)