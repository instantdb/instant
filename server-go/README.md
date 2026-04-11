# Instant Server (Go + SQLite)

A single-binary, zero-dependency backend for [InstantDB](https://instantdb.com) — the modern Firebase. Drop it on any machine, run it, and point your `@instantdb/react` (or core/vanilla) app at it.

```
curl -L -o instant-server https://github.com/necrodome/instant/releases/latest/download/instant-server
chmod +x instant-server
./instant-server
```

That's it. Your data lives in `instant.db` next to the binary.

## Quickstart

### 1. Start the server

```bash
# Build from source
cd server-go
CGO_ENABLED=1 go build -o instant-server ./cmd/instant/
./instant-server
```

```
Starting Instant server (SQLite) on port 8888
Database: instant.db
Listening on :8888
```

### 2. Create an app

```bash
curl -X POST http://localhost:8888/admin/apps \
  -H 'Content-Type: application/json' \
  -d '{"title": "My App"}'
```

```json
{
  "app": {
    "id": "5a5d3a5e-4b3c-4e5f-8a2b-1c3d4e5f6a7b",
    "title": "My App",
    "admin-token": "your-admin-token"
  }
}
```

Save the `id` and `admin-token`.

### 3. Connect your React app

```bash
npm i @instantdb/react
```

```jsx
import { init, tx, id } from '@instantdb/react';

const db = init({
  appId: 'YOUR_APP_ID',           // from step 2
  apiURI: 'http://localhost:8888',
  websocketURI: 'ws://localhost:8888/runtime/session',
});

function App() {
  // Read data (updates in real-time)
  const { data } = db.useQuery({ todos: {} });

  // Write data
  const addTodo = () => {
    db.transact(tx.todos[id()].update({
      text: 'Hello world',
      done: false,
      createdAt: Date.now(),
    }));
  };

  return (
    <div>
      <button onClick={addTodo}>Add Todo</button>
      <ul>
        {data?.todos?.map(t => (
          <li key={t.id}>{t.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 4. Push a schema (optional, for type safety)

```bash
curl -X POST http://localhost:8888/admin/schema \
  -H 'Content-Type: application/json' \
  -H 'app-id: YOUR_APP_ID' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -d '{
    "schema": {
      "entities": {
        "todos": {
          "attrs": {
            "text": {},
            "done": {},
            "createdAt": {}
          }
        }
      }
    }
  }'
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PORT` | `8888` | HTTP server port |
| `DB_PATH` | `instant.db` | SQLite database file path |
| `JWT_SECRET` | `instant-dev-secret` | Secret for signing auth tokens |

## What's included

Everything you need from InstantDB, in a 13MB binary:

| Feature | Status |
|---|---|
| **Queries** — `useQuery` with filters, ordering, pagination, nested joins | Full |
| **Transactions** — create, update, merge, delete, link/unlink | Full |
| **Real-time** — live subscriptions, optimistic updates | Full |
| **Permissions** — CEL rules (view/create/update/delete + field-level) | Full |
| **Presence** — rooms, cursors, typing indicators, broadcasts | Full |
| **Auth** — magic codes, guest auth, JWT, admin tokens, OAuth | Full |
| **Storage** — file upload/query/delete | Full |
| **Streams** — write/read/subscribe with offset resume | Full |
| **Pagination** — offset + cursor-based with pageInfo | Full |
| **Admin API** — REST endpoints for schema, rules, users, impersonation | Full |

## API endpoints

### WebSocket / SSE

```
GET  /runtime/session?app_id=ID     # WebSocket (primary)
GET  /runtime/sse?app_id=ID         # Server-Sent Events (fallback)
POST /runtime/sse                    # SSE message POST
```

### Admin REST API

```
POST   /admin/apps                   # Create app
GET    /admin/apps?app_id=ID         # Get app
DELETE /admin/apps                   # Delete app
POST   /admin/query                  # Execute query
POST   /admin/transact               # Execute transaction
POST   /admin/schema                 # Push schema
GET    /admin/schema                 # Get schema
POST   /admin/rules                  # Set permission rules
GET    /admin/rules                  # Get rules
POST   /admin/users                  # Create user
GET    /admin/users                  # List users
DELETE /admin/users                  # Delete user
POST   /admin/magic-code/send        # Send magic code
POST   /admin/magic-code/verify      # Verify magic code
POST   /admin/sign-in-as-guest       # Guest auth
POST   /admin/custom-auth-token      # Custom auth token
POST   /admin/storage/upload         # Upload file metadata
GET    /admin/storage/files          # List files
DELETE /admin/storage/files          # Delete file
GET    /admin/oauth/start            # Start OAuth flow
GET    /admin/oauth/callback         # OAuth callback
GET    /health                       # Health check
```

All admin endpoints require `app-id` header and `Authorization: Bearer ADMIN_TOKEN`.

### Impersonation

Test permissions as a specific user:

```bash
# As a specific user (by email)
curl -H 'as-email: alice@example.com' ...

# As a specific user (by refresh token)
curl -H 'as-token: REFRESH_TOKEN' ...

# As a guest
curl -H 'as-guest: true' ...
```

## Architecture

```
instant-server (13MB binary)
├── WebSocket/SSE server (gorilla/websocket)
├── InstaQL query engine (SQL generation for SQLite)
├── Transaction processor (InstaML → SQLite)
├── Permission engine (CEL-compatible expressions)
├── Reactive invalidation (trigger-based changelog)
├── Presence & rooms (in-memory, channels)
├── Auth (JWT HS256, magic codes, OAuth state)
└── SQLite database (single file, WAL mode)
    ├── apps, app_users, attrs, triples
    ├── rules, changelog
    ├── files, streams, stream_data
    └── sync_subscriptions, oauth_states
```

## Development

```bash
# Run tests (110 tests)
CGO_ENABLED=1 go test ./... -count=1

# Build
CGO_ENABLED=1 go build -o instant-server ./cmd/instant/

# Run with custom config
PORT=3000 DB_PATH=/data/my.db JWT_SECRET=supersecret ./instant-server
```

## How it compares to the Clojure server

| | Clojure Server | Go Server |
|---|---|---|
| **Runtime** | JVM (Java 22) | Native binary |
| **Database** | PostgreSQL / Aurora | SQLite |
| **Binary size** | ~200MB (JAR + JRE) | 13MB |
| **Memory** | 512MB+ | ~20MB |
| **Dependencies** | Hazelcast, HikariCP, etc. | 2 (sqlite3, websocket) |
| **Deployment** | Docker + RDS | Copy binary, run |
| **Multi-instance** | Yes (Hazelcast) | Single instance |
| **Target** | Cloud production | Self-hosted / edge / dev |
