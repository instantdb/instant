import { InstantOAuthError, type OAuthScope } from './oauthCommon.ts';
import {
  type InstantDBOAuthAccessToken,
  type OAuthHandlerConfig,
  OAuthHandler,
} from './oauth.ts';
import { generatePermsTypescriptFile } from './perms.ts';
import {
  type InstantAPIPlatformSchema,
  generateSchemaTypescriptFile,
} from './schema.ts';
import {
  apiSchemaToInstantSchemaDef,
  PlatformApi,
  translatePlanSteps,
} from './api.ts';
import { schemaTypescriptFileToInstantSchema } from './typescript-schema.ts';

import version from './version.js';
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
  generatePermsTypescriptFile,
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
