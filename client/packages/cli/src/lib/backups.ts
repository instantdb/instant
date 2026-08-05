import { Effect } from 'effect';
import type { BackupsManager } from '@instantdb/platform';
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
    return yield* Effect.tryPromise({
      try: () => fun(api.backups(appId)),
      catch: (e) =>
        new PlatformApiError({
          message: errorMessage ?? 'Error using backups api',
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
