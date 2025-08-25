# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-08-16

### Added
- Initial release of @instantdb/node
- Full compatibility with @instantdb/core API
- Node.js-specific adapters:
  - FileSystemStorage for persistent local storage
  - NodeWebSocket using the 'ws' package
  - NodeNetworkListener for network status
  - NodeAuthStorage for secure token storage
- Production-ready features:
  - Connection pooling for efficient resource usage
  - Subscription management with automatic cleanup
  - Memory leak prevention for long-running processes
  - Graceful shutdown handling
- Comprehensive examples:
  - Basic usage example
  - Real-time sync between multiple Node.js instances
  - Express.js integration
  - Production server setup
- Full TypeScript support with proper type exports
- Support for both CommonJS and ESM modules

### Features
- Real-time data synchronization
- Offline-first with file system persistence
- Authentication with magic links
- Relational queries
- Optimistic updates
- Transaction support
- Presence and rooms functionality
- File storage capabilities

### Notes
- Requires Node.js 14.0.0 or higher
- Data is stored in `~/.instantdb/<app-id>/`
- Tokens are encrypted and stored securely on the file system