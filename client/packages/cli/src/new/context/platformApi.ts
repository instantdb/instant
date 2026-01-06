import { Data, Effect, Schema } from 'effect';
import { getBaseUrl } from '../lib/http.js';
import { PlatformApi as InstantPlatformApi } from '@instantdb/platform';

export class PlatformApiError extends Data.TaggedError('PlatformApiError')<{
  message: string;
  cause: unknown;
}> {}

export class PlatformApi extends Effect.Service<PlatformApi>()(
  'instant-cli/new/context/platformApi',
  {
    effect: Effect.gen(function* () {
      const origin = yield* getBaseUrl;
      const apiClient = new InstantPlatformApi({
        apiURI: origin,
      });

      return {
        use: <R>(
          fun: (api: typeof apiClient) => Promise<R>,
          errorMessage?: string,
        ) =>
          Effect.tryPromise({
            try: (_signal) => fun(apiClient),
            catch: (e) =>
              new PlatformApiError({
                message: errorMessage || 'Error using platform api',
                cause: e,
              }),
          }),
      };
    }),
  },
) {}
