// Re-export everything from core that doesn't need modification
export {
  // Core functions
  id,
  tx,
  txInit,
  lookup,
  getOps,
  coerceQuery,
  weakHash,
  version,
  
  // Validation
  validateQuery,
  QueryValidationError,
  validateTransactions,
  TransactionValidationError,
  
  // Types
  type Config,
  type InstantConfig,
  type ConfigWithSchema,
  type Query,
  type QueryResponse,
  type InstaQLResponse,
  type PageInfoResponse,
  type AuthState,
  type User,
  type AuthToken,
  type ConnectionStatus,
  type TransactionChunk,
  type TransactionResult,
  type TxChunk,
  type SubscriptionState,
  type InstaQLSubscriptionState,
  type LifecycleSubscriptionState,
  type InstaQLLifecycleState,
  
  // Query types
  type InstaQLParams,
  type InstaQLOptions,
  type InstaQLQueryParams,
  type InstaQLEntity,
  type InstaQLEntitySubquery,
  type InstaQLResult,
  type InstaQLFields,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantObject,
  type InstantEntity,
  type InstantSchemaDatabase,
  type IInstantDatabase,
  type IDatabase,
  type Exactly,
  
  // Schema types
  type BackwardsCompatibleSchema,
  type EntityDef,
  type InstantGraph,
  type LinkDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type CardinalityKind,
  type DataAttrDef,
  type LinkAttrDef,
  type InstantUnknownSchema,
  type InstantSchemaDef,
  type AttrsDefs,
  type LinksDef,
  type ValueTypes,
  type ResolveAttrs,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
  type RuleParams,
  
  // Room/Presence types
  type RoomSchemaShape,
  type RoomsDef,
  type RoomsOf,
  type PresenceOf,
  type TopicsOf,
  type TopicOf,
  type PresenceOpts,
  type PresenceSlice,
  type PresenceResponse,
  
  // Attr types
  type InstantDBAttr,
  type InstantDBAttrOnDelete,
  type InstantDBCheckedDataType,
  type InstantDBIdent,
  type InstantDBInferredType,
  
  // Auth types
  type ExchangeCodeForTokenParams,
  type SendMagicCodeParams,
  type SendMagicCodeResponse,
  type SignInWithIdTokenParams,
  type VerifyMagicCodeParams,
  type VerifyResponse,
  
  // Storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,
  
  // Errors
  InstantError,
  InstantAPIError,
  type InstantIssue,
  
  // CLI
  i,
} from '@instantdb/core';

// Import core modules we need
import {
  InstantCoreDatabase,
  Auth,
  Storage,
  weakHash,
  version as coreVersion,
} from '@instantdb/core';
import Reactor from './Reactor.js';
import { createFileSystemStorage } from './adapters/FileSystemStorage.js';
import { createNodeNetworkListener } from './adapters/NodeNetworkListener.js';
import { globalConnectionManager } from './utils/ConnectionManager.js';
import { globalSubscriptionManager } from './utils/SubscriptionManager.js';

// Re-export types from core that we need
import type {
  InstantConfig,
  InstantSchemaDef,
  InstantUnknownSchema,
  RoomsOf,
  Query,
} from '@instantdb/core';

// Default config
const defaultConfig = {
  apiURI: 'https://api.instantdb.com',
  websocketURI: 'wss://api.instantdb.com/runtime/session',
};

// Global store for reactor instances
const globalInstantNodeStore: Record<string, any> = {};

function reactorKey(config: InstantConfig<any, boolean>): string {
  // @ts-expect-error
  const adminToken = config.__adminToken;
  return (
    config.appId +
    '_' +
    (config.websocketURI || 'default_ws_uri') +
    '_' +
    (config.apiURI || 'default_api_uri') +
    '_' +
    (adminToken || 'client_only') +
    '_' +
    config.useDateObjects
  );
}

/**
 * Initialize Instant for Node.js
 *
 * @example
 * ```typescript
 * import { init } from '@instantdb/node';
 *
 * const db = init({
 *   appId: 'your-app-id',
 *   schema: yourSchema, // optional
 * });
 *
 * // Subscribe to queries
 * db.subscribeQuery({ users: {} }, (result) => {
 *   console.log('Users:', result.data.users);
 * });
 * ```
 */
export function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
  UseDates extends boolean = false,
>(
  config: InstantConfig<Schema, UseDates>,
  versions?: { [key: string]: string }
): InstantCoreDatabase<Schema, UseDates> {
  const key = reactorKey(config);
  
  // Check if we already have a connection
  const existingClient = globalConnectionManager.getConnection(key) as InstantCoreDatabase<Schema, UseDates>;
  if (existingClient) {
    return existingClient;
  }

  // Create a new Reactor with Node.js adapters
  const reactor = new Reactor<RoomsOf<Schema>>(
    {
      ...defaultConfig,
      ...config,
      cardinalityInference: config.schema ? true : false,
    },
    createFileSystemStorage,
    createNodeNetworkListener,
    { ...(versions || {}), '@instantdb/core': coreVersion, '@instantdb/node': '0.1.0' }
  );

  // Cast to any to bypass TypeScript's type checking since our Reactor is compatible
  const client = new InstantCoreDatabase<Schema, UseDates>(reactor as any);
  
  // Add to connection manager
  globalConnectionManager.addConnection(key, client);
  
  // Keep backward compatibility
  globalInstantNodeStore[key] = client;

  return client;
}

/**
 * @deprecated Use `init` instead
 */
export const init_experimental = init;

/**
 * Production-ready wrapper for subscribeQuery with automatic cleanup
 */
export function subscribeQuery(
  db: any, // Use any to avoid complex type issues
  query: any,
  callback: (result: any) => void,
  subscriptionId?: string
) {
  const id = subscriptionId || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const unsubscribe = db.subscribeQuery(query, (result: any) => {
    globalSubscriptionManager.updateActivity(id);
    callback(result);
  });
  
  globalSubscriptionManager.add(id, unsubscribe, JSON.stringify(query));
  
  // Return enhanced unsubscribe function
  return () => {
    globalSubscriptionManager.unsubscribe(id);
  };
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  return {
    connections: globalConnectionManager.getStats(),
    subscriptions: globalSubscriptionManager.getStats(),
  };
}

/**
 * Manually close a specific connection
 */
export function closeConnection(appId: string) {
  const keys = Object.keys(globalInstantNodeStore).filter(key => key.startsWith(appId));
  keys.forEach(key => {
    globalConnectionManager.closeConnection(key);
    delete globalInstantNodeStore[key];
  });
}

/**
 * Close all connections and clean up resources
 */
export function shutdown() {
  globalConnectionManager.closeAllConnections();
  globalSubscriptionManager.unsubscribeAll();
  Object.keys(globalInstantNodeStore).forEach(key => {
    delete globalInstantNodeStore[key];
  });
}

// Export Node.js specific utilities
export { NodeWebSocket } from './adapters/NodeWebSocket.js';
export { FileSystemStorage } from './adapters/FileSystemStorage.js';
export { NodeNetworkListener } from './adapters/NodeNetworkListener.js';
export { NodeAuthStorage } from './adapters/NodeAuthStorage.js';

// Export managers for advanced usage
export { ConnectionManager } from './utils/ConnectionManager.js';
export { SubscriptionManager } from './utils/SubscriptionManager.js';

// Re-export core classes
export { InstantCoreDatabase, Auth, Storage };