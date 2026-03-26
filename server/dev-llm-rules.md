You are an expert developer on the InstantDB team. You write clean and concise code. You make sure you
follow the style of the codebase you are working on. You write code that is easy
to read and understand.

# About InstantDB aka Instant

Instant is a client-side database (Modern Firebase) with built-in queries, transactions, auth, permissions, storage, real-time, and offline support.

# InstantDB Server Directory Layout

## Overview

The InstantDB server is a Clojure/JVM backend providing real-time database functionality with reactive queries, schema management, and multi-tenant support. It runs on Undertow (HTTP/WebSocket), backed by PostgreSQL/Aurora, with Hazelcast for clustering and gRPC for inter-service communication.

## Root Directory

- `deps.edn` - Clojure dependencies and build aliases
- `build.clj` - Build configuration (tools.build)
- `Makefile` - Development commands (see Dev Workflow below)
- `Dockerfile` / `Dockerfile-dev` - Container images
- `docker-compose-dev.yml` - Docker development environment
- `Caddyfile.dev` - Local HTTPS reverse proxy config
- `cljfmt.edn` - Code formatting config

## Source Code (`/src/instant/`)

### Core System

- `core.clj` - Main entry point, HTTP routing, middleware, server startup
- `config.clj` / `config_edn.clj` - Environment and configuration management
- `aurora_config.clj` - AWS Aurora database config
- `flags.clj` / `flags_impl.clj` - Feature flag system
- `health.clj` - Health check endpoints
- `system_catalog.clj` / `system_catalog_ops.clj` / `system_catalog_migration.clj` - Internal metadata and system catalog

### Database Layer (`/db/`)

The query engine and data persistence layer:

- `datalog.clj` - Core datalog query engine
- `instaql.clj` - InstantQL query language processor
- `transaction.clj` - ACID transaction processing
- `permissioned_transaction.clj` - Permission-aware transactions
- `dataloader.clj` - Batched data loading (DataLoader pattern)
- `cel.clj` / `cel_builder.clj` - Google CEL (Common Expression Language) for permission rules
- `indexing_jobs.clj` - Background schema indexing
- `pg_introspect.clj` - PostgreSQL schema introspection
- `/db/model/` - Low-level data models: attributes (`attr.clj`), triples (`triple.clj`), entities (`entity.clj`)

### Domain Models (`/model/`)

Business logic and domain models (~35 files). Key groups:

- `schema.clj` - Core schema operations, migrations, validation
- `rule.clj` - Permission rule definitions and enforcement
- `app.clj` and `app_*.clj` - Application-level models (users, OAuth, email, files, streams, etc.)
- `instant_user.clj` and `instant_*.clj` - Platform user models (profiles, tokens, CLI login, etc.)
- `org.clj` / `org_members.clj` / `member_invites.clj` - Organization and team management

### JDBC Layer (`/jdbc/`)

Database connectivity and low-level operations:

- `aurora.clj` - Aurora/PostgreSQL connectivity
- `sql.clj` - SQL generation and execution
- `wal.clj` - Write-ahead log for change tracking
- `failover.clj` - High availability and failover
- `pgerrors.clj` - PostgreSQL error handling

### Reactive System (`/reactive/`)

Real-time subscriptions and change propagation:

- `session.clj` - WebSocket session management
- `query.clj` - Reactive query processing
- `invalidator.clj` - Cache invalidation and change detection
- `store.clj` - Subscription state storage
- `ephemeral.clj` - Ephemeral (presence/cursors) subscriptions
- `sse.clj` - Server-sent events

### HTTP Routes & APIs

Four route groups, each in their own directory:

- `admin/routes.clj` - Admin API (app management, schema ops)
- `dash/routes.clj` - Dashboard API (frontend dashboard)
- `runtime/routes.clj` - Runtime API (client SDK endpoints)
- `superadmin/routes.clj` - Internal super-admin endpoints
- `oauth_apps/routes.clj` - OAuth application management

### Authentication (`/auth/`)

- `oauth.clj` - OAuth provider integrations (Google, GitHub, etc.)
- `jwt.clj` - JWT token generation and validation

### Storage (`/storage/`)

- `s3.clj` - AWS S3 operations
- `routes.clj` - Storage API endpoints
- `coordinator.clj` - Upload coordination

### gRPC

- `grpc.clj` / `grpc_server.clj` / `grpc_client.clj` - gRPC service for inter-server communication

### External Integrations

- `stripe.clj` / `stripe_webhook.clj` - Stripe payments
- `sendgrid.clj` / `postmark.clj` - Email delivery
- `discord.clj` - Discord notifications

### Utilities (`/util/`)

~37 utility files covering: async, crypto, AWS/S3/CloudFront, HTTP, JSON, tracing/observability, caching, postgres helpers, and more.

### Background Jobs (`/scripts/`)

Clojure scripts for scheduled/background work: `analytics.clj`, `daily_metrics.clj`, `newsletter.clj`, `clone_app.clj`, `welcome_email.clj`.

### Java Extensions (`/src/java/`)

Performance-critical JNI socket tracking code.

## Resources (`/resources/`)

- `/config/` - Environment configs: `dev.edn`, `test.edn`, `staging.edn`, `prod.edn`
- `/migrations/` - ~200 SQL migration files (up/down pairs)
- `/emails/` - Email templates
- `logback.xml` - Logging configuration

## Tests (`/test/instant/`)

Mirrors the source structure. Run with `make test`.

## Dev Workflow

### Common Commands

```
make dev              # Start server (port 8888, nREPL 6005)
make docker-compose   # Full Docker dev environment
make test             # Run test suite
make compile-java     # Compile Java extensions (needed before first test run)
make dev-up           # Run database migrations up
make dev-down         # Roll back one migration
make create-migration # Create new migration files
make lint             # Run clj-kondo linter
make psql             # Connect to local database
```

### Multiple Instances

Use `DEV_SLOT` for running multiple servers: `DEV_SLOT=1 make dev` (shifts all ports by 1000).

### Entry Point

Application starts at `instant.core/-main`. Server runs on Undertow at port 8888 (configurable via `PORT` env var). nREPL available on port 6005.

## Navigation Guide

- **Schema/permissions work**: Start at `model/schema.clj` and `model/rule.clj`, then `db/cel.clj` for CEL evaluation
- **Query processing**: `db/instaql.clj` -> `db/datalog.clj` -> `reactive/query.clj` for real-time
- **Transaction flow**: `db/transaction.clj` -> `db/permissioned_transaction.clj`
- **API endpoints**: Check `{admin,dash,runtime,superadmin}/routes.clj`
- **Real-time/WebSocket**: `reactive/session.clj` -> `reactive/invalidator.clj` -> `reactive/store.clj`
- **Auth flow**: `auth/oauth.clj`, `auth/jwt.clj`, `runtime/magic_code_auth.clj`
- **Configuration**: `config.clj` reads from `resources/config/*.edn`, override with `resources/config/override.edn`
