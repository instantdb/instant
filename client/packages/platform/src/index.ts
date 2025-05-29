import { InstantOAuthError } from './oauthCommon.ts';
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
import { PlatformApi, translatePlanSteps } from './api.ts';

import version from './version.js';
import { ProgressPromise } from './ProgressPromise.ts';
import { i } from '@instantdb/core';

export {
  type InstantAPIPlatformSchema,
  type InstantDBOAuthAccessToken,
  type OAuthHandlerConfig,
  OAuthHandler,
  InstantOAuthError,
  generateSchemaTypescriptFile,
  generatePermsTypescriptFile,
  version,
  translatePlanSteps,
  PlatformApi,
  ProgressPromise,
  i,
};
