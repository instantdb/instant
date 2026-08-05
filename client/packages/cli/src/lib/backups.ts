import { Effect } from 'effect';
import type { BackupsManager } from '@instantdb/platform';
import { AuthToken } from '../context/authToken.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { PlatformApiError } from '../context/platformApi.ts';
import { getAuthedPlatformApi } from './platformApi.ts';

export const useBackupsManager = <R>(
  fun: (manager: BackupsManager) => Promise<R>,
  errorMessage?: string,
) =>
  Effect.gen(function* () {
    const api = yield* getAuthedPlatformApi;
    const { appId } = yield* CurrentApp;
    const authToken = yield* AuthToken;
    const source = yield* authToken.getSource;
    // An admin token from the environment silently outranks a saved login,
    // and the server error alone gives no hint which credential was used.
    const hint =
      source === 'admin'
        ? ' (used the admin token from your environment; if it is stale, remove INSTANT_APP_ADMIN_TOKEN or run `instant-cli login`)'
        : '';
    return yield* Effect.tryPromise({
      try: () => fun(api.backups(appId)),
      catch: (e) =>
        new PlatformApiError({
          message: (errorMessage ?? 'Error using backups api') + hint,
          cause: e,
        }),
    });
  });

/**
 * Yields a `BackupsManager` instance scoped to the current app. Use when you
 * need to hold on to the manager outside an Effect (e.g. to drive the
 * long-running download pipeline).
 */
export const buildBackupsManager = Effect.gen(function* () {
  const api = yield* getAuthedPlatformApi;
  const { appId } = yield* CurrentApp;
  return api.backups(appId);
});
