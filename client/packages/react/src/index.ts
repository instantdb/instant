import {
  id,
  tx,
  lookup,
  i,

  // error
  InstantAPIError,

  // sync table enums
  SyncTableCallbackEventType,

  // types
  type QueryResponse,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantObject,
  type InstantEntity,
  type InstantSchemaDatabase,
  type InstantUnknownSchemaDef,
  type IInstantDatabase,
  type User,
  type AuthState,
  type Query,
  type Config,
  type InstaQLParams,
  type ConnectionStatus,
  type ValidQuery,

  // presence types
  type PresencePeer,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type InstantConfig,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstaQLEntity,
  type InstaQLFields,
  type InstaQLResult,
  type InstaQLEntitySubquery,
  type RoomsOf,
  type RoomsDef,
  type PresenceOf,
  type TopicsOf,
  type TopicOf,
  type RoomHandle,
  type TransactionChunk,
  type InstantUnknownSchema,
  type InstantSchemaDef,
  type BackwardsCompatibleSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
  type CreateParams,
  type ExchangeCodeForTokenParams,
  type SendMagicCodeParams,
  type SendMagicCodeResponse,
  type SignInWithIdTokenParams,
  type VerifyMagicCodeParams,
  type VerifyResponse,

  // storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,

  // sync table types
  type SyncTableCallback,
  type SyncTableCallbackEvent,
  type SyncTableInitialSyncBatch,
  type SyncTableInitialSyncComplete,
  type SyncTableSyncTransaction,
  type SyncTableLoadFromStorage,
  type SyncTableSetupError,
} from '@instantdb/core';

import { InstantReactAbstractDatabase } from '@instantdb/react-common';
import InstantReactWebDatabase from './InstantReactWebDatabase.ts';
import { init, init_experimental } from './init.ts';
import { Cursors } from './Cursors.tsx';

export {
  id,
  tx,
  lookup,
  init,
  init_experimental,
  InstantReactWebDatabase,
  Cursors,
  i,

  // error
  InstantAPIError,

  // internal
  InstantReactAbstractDatabase,

  // sync table enums
  SyncTableCallbackEventType,

  // types
  type Config,
  type InstantConfig,
  type InstantUnknownSchemaDef,
  type Query,
  type QueryResponse,
  type InstantObject,
  type User,
  type AuthState,
  type ConnectionStatus,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantEntity,
  type InstantSchemaDatabase,
  type IInstantDatabase,
  type InstaQLParams,
  type ValidQuery,
  type InstaQLFields,

  // presence types
  type PresencePeer,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type ValueTypes,
  type InstaQLEntity,
  type InstaQLResult,
  type InstaQLEntitySubquery,
  type RoomsOf,
  type RoomsDef,
  type TransactionChunk,
  type PresenceOf,
  type TopicsOf,
  type TopicOf,
  type RoomHandle,
  type InstantUnknownSchema,
  type InstantSchemaDef,
  type BackwardsCompatibleSchema,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
  type CreateParams,
  type ExchangeCodeForTokenParams,
  type SendMagicCodeParams,
  type SendMagicCodeResponse,
  type SignInWithIdTokenParams,
  type VerifyMagicCodeParams,
  type VerifyResponse,

  // storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,

  // sync table types
  type SyncTableCallback,
  type SyncTableCallbackEvent,
  type SyncTableInitialSyncBatch,
  type SyncTableInitialSyncComplete,
  type SyncTableSyncTransaction,
  type SyncTableLoadFromStorage,
  type SyncTableSetupError,
};
