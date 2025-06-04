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

import version from './version.js';
import { ProgressPromise } from './ProgressPromise.ts';
import { i, type InstantRules } from '@instantdb/core';

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
  version,
  translatePlanSteps,
  PlatformApi,
  ProgressPromise,
  i,
};
