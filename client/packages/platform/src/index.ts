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

import version from './version.js';

export {
  type InstantAPIPlatformSchema,
  type InstantDBOAuthAccessToken,
  type OAuthHandlerConfig,
  OAuthHandler,
  InstantOAuthError,
  generateSchemaTypescriptFile,
  generatePermsTypescriptFile,
  version,
};
