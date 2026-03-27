You are an expert developer on the InstantDB team. You write clean and concise code. You make sure you
follow the style of the codebase you are working on. You write code that is easy
to read and understand.

# About InstantDB aka Instant

Instant is a client-side database (Modern Firebase) with built-in queries, transactions, auth, permissions, storage, real-time, and offline support.

# InstantDB Client Directory Layout

## Overview

The client directory is a pnpm monorepo managed with Turbo. It contains the InstantDB client SDKs, a Next.js web application (instantdb.com), and development sandboxes.

## Root Configuration

- **`package.json`** / **`pnpm-workspace.yaml`** - Monorepo workspace config
- **`turbo.json`** - Turbo build orchestration
- **`tsconfig.base.json`** - Shared TypeScript configuration
- **`Makefile`** - Development commands (`make dev`, etc.)
- **`version.md`** - Current version tracking

## Packages (`/packages/`)

### Core

- **`core/`** (`@instantdb/core`) - Core abstraction powering all client libraries. Contains the query engine (`instaql.ts`), schema handling (`schema.ts`), connection management (`Connection.ts`), transactions, auth, and storage APIs.
- **`version/`** (`@instantdb/version`) - Shared version constant used by all packages.

### Framework SDKs

- **`react/`** (`@instantdb/react`) - React hooks and components. Includes Next.js SSR support via `/next-ssr` export (`HydrationStreamProvider`, `InstantNextDatabase`, `InstantSuspenseProvider`).
- **`react-common/`** (`@instantdb/react-common`) - Shared hooks/logic between React and React Native.
- **`react-native/`** (`@instantdb/react-native`) - React Native client with AsyncStorage and NetInfo integration.
- **`react-native-mmkv/`** (`@instantdb/react-native-mmkv`) - MMKV storage adapter for React Native.
- **`solidjs/`** (`@instantdb/solidjs`) - SolidJS client library.
- **`svelte/`** (`@instantdb/svelte`) - Svelte client library.

### Tools and Utilities

- **`admin/`** (`@instantdb/admin`) - Server-side admin SDK for backend access to Instant.
- **`platform/`** (`@instantdb/platform`) - Platform package for managing apps, schemas, permissions, and migrations. Used by CLI and internal tools.
- **`cli/`** (`instant-cli`) - Command-line tool for project init, schema management, and config.
- **`create-instant-app/`** (`create-instant-app`) - Scaffolding tool for new Instant projects.
- **`components/`** (`@instantdb/components`) - Reusable UI components including the database Explorer (Monaco Editor, dnd-kit, Radix UI).
- **`mcp/`** (`@instantdb/mcp`) - MCP server enabling AI assistants to manage Instant apps.
- **`resumable-stream/`** (`@instantdb/resumable-stream`) - Drop-in replacement for Vercel's resumable-stream for Next.js streaming.

## Web Application (`/www/`)

Next.js 15+ app serving instantdb.com (dashboard, docs, marketing).

### Pages (`/www/pages/`)

- **`index.tsx`** - Homepage
- **`dash/`** - User dashboard: app management, org management, onboarding, OAuth callbacks, user settings
- **`docs/`** - Markdown-based documentation (auth guides, database, storage, permissions, InstaQL, InstaML, CLI, backend, HTTP API, patterns, common mistakes)
- **`product/`** - Product feature pages (database, auth, storage, sync, admin-sdk)
- **`essays/`** - Blog posts
- **`examples/`** - Code examples showcase
- **`recipes/`** - Interactive examples (todos, auth, cursors, etc.)
- **`intern/`** - Internal tools (docs feedback dashboard, chat, email viewer, investor updates)
- **`labs/`** - Experimental features
- **`api/`** - API routes (OG image generation, chat)
- **`_devtool/`** - Development tool interface

### Components (`/www/components/`)

- **`dash/`** - Dashboard UI (auth components, explorer, org management)
- **`docs/`** - Documentation components and icons
- **`product/`** - Product page components
- **`essays/`** - Blog components
- **`chat/`** - Chat interface
- **`admin/`** - Admin components
- **`ui/`** (inside `components/`) - Reusable primitives (buttons, cards, etc.)
- **`icons/`** - Icon library
- **`intern/`** - Internal tool components

### Lib (`/www/lib/`)

- **`hooks/`** - Custom React hooks (`useDashFetch`, `useExplorerState`, `useOrgPaid`, `useLocalStorage`, `useMonacoJsonSchema`, etc.)
- **`product/`** - Feature-specific utilities and examples
- **`intern/`** - Internal tools config, docs feedback system, `instant-rules.md` (LLM rules)
- **`types.ts`**, **`contexts.ts`**, **`format.ts`**, **`markdoc.ts`**, **`monaco.ts`**, **`posts.ts`** - Shared utilities

### Other www directories

- **`markdoc/`** - Custom Markdoc rendering config
- **`styles/`** - Global styles and Tailwind config
- **`scripts/`** - Build scripts (`gen-llm-rules.ts`, `gen-md-docs.ts`, `gen-rss.ts`, `index-docs.ts`)
- **`_posts/`** - Blog post content
- **`_examples/`** - Example code content
- **`_emails/`** - Email templates (HTML, text, markdown)
- **`data/tutorial-snippets/`** - Tutorial code snippets
- **`public/`** - Static assets (images, fonts, marketing assets, LLM rules)

## Sandboxes (`/sandbox/`)

Development sandboxes for testing local changes to client libraries:

- **`react-nextjs/`** - Next.js app testing `@instantdb/react`
- **`vanilla-js-vite/`** - Vanilla JS testing `@instantdb/core`
- **`react-native-expo/`** - Expo app testing `@instantdb/react-native`
- **`admin-sdk-express/`** - Express app testing `@instantdb/admin`
- **`cli-nodejs/`** - Node.js testing `instant-cli`
- **`strong-init-vite/`** - Vite app testing typed initialization
- **`vanilla-js-nuxt/`** - Nuxt 3 integration
- **`task-tracker/`** - Full-featured example app

## Navigation Guide

### For Core SDK Development

Start with `packages/core/` for the query engine, schema, and connection logic.

### For React/Next.js SDK

`packages/react/` for hooks, `packages/react-common/` for shared logic, and `packages/react/src/next-ssr/` for SSR support.

### For Dashboard Development

`www/pages/dash/` for page routes, `www/components/dash/` for UI components, `www/lib/hooks/` for data fetching.

### For Documentation

`www/pages/docs/` for content (Markdoc/Markdown), `www/components/docs/` for rendering components.

### For CLI / Platform Tools

`packages/cli/` for the CLI entry point, `packages/platform/` for schema and migration logic.

### For Testing Local Changes

Use the sandbox apps. `make dev` starts core libs, www, react-nextjs sandbox, and admin-sdk-express sandbox.
