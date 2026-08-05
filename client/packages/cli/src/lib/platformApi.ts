import { Effect } from 'effect';
import { PlatformApi as InstantPlatformApi } from '@instantdb/platform';
import { AuthToken } from '../context/authToken.ts';
import { getBaseUrl } from './config.ts';

export const getAuthedPlatformApi = Effect.gen(function* () {
  const apiURI = yield* getBaseUrl;
  const authToken = yield* AuthToken;
  const token = yield* authToken.getAuthToken;
  return new InstantPlatformApi({ apiURI, auth: { token } });
});
