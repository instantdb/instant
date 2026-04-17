import { InstantOAuthError, type OAuthScope } from './oauthCommon.ts';
import {
  type InstantDBOAuthAccessToken,
  type OAuthHandlerConfig,
  OAuthHandler,
} from './oauth.ts';
import {
  generatePermsTypescriptFile,
  permsTypescriptFileToCode,
} from './perms.ts';
import {
  type InstantAPIPlatformSchema,
  generateSchemaTypescriptFile,
  collectSystemCatalogIdentNames,
  validateSchema,
  SchemaValidationError,
} from './schema.ts';
import {
  apiSchemaToInstantSchemaDef,
  PlatformApi,
  translatePlanSteps,
} from './api.ts';
import { schemaTypescriptFileToInstantSchema } from './typescript-schema.ts';

import version from './version.ts';
import { ProgressPromise } from './ProgressPromise.ts';
import { i, type InstantRules } from '@instantdb/core';
import { exchangeCodeForToken, exchangeRefreshToken } from './serverOAuth.ts';

export {
  type InstantAPIPlatformSchema,
  type InstantDBOAuthAccessToken,
  type OAuthHandlerConfig,
  type OAuthScope,
  type InstantRules,
  OAuthHandler,
  InstantOAuthError,
  generateSchemaTypescriptFile,
  collectSystemCatalogIdentNames,
  validateSchema,
  SchemaValidationError,
  generatePermsTypescriptFile,
  permsTypescriptFileToCode,
  apiSchemaToInstantSchemaDef,
  schemaTypescriptFileToInstantSchema,
  version,
  translatePlanSteps,
  PlatformApi,
  ProgressPromise,
  exchangeCodeForToken,
  exchangeRefreshToken,
  i,
};

export {
  diffSchemas,
  convertTxSteps,
  isRenamePromptItem,
  buildAutoRenameSelector,
  type RenameResolveFn,
  type MigrationTx,
  type MigrationTxSpecific,
  type MigrationTxTypes,
  type Identifier,
} from './migrations.ts';

export {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_DEFAULT_CALLBACK_URL,
  GOOGLE_DISCOVERY_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  APPLE_AUTHORIZATION_ENDPOINT,
  APPLE_DEFAULT_CALLBACK_URL,
  APPLE_DISCOVERY_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  LINKEDIN_AUTHORIZATION_ENDPOINT,
  LINKEDIN_DEFAULT_CALLBACK_URL,
  LINKEDIN_DISCOVERY_ENDPOINT,
  LINKEDIN_TOKEN_ENDPOINT,
} from './consts.ts';
