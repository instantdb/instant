import { Effect, Layer } from 'effect';
import { NodeHttpClient } from '@effect/platform-node';
import { PlatformApi } from '../src/new/context/platformApi.js';
import { CurrentApp } from '../src/new/context/currentApp.js';
import { InstantHttpAuthedLive, InstantHttpLive } from '../src/new/lib/http.js';
import { AuthToken } from '../src/new/context/authToken.js';
import { GlobalOpts } from '../src/new/context/globalOpts.js';

export const getAppLayer = (title: string) =>
  Effect.gen(function* () {
    const platform = yield* PlatformApi;
    const app = yield* platform.use((api) =>
      api.createTemporaryApp({
        title: title,
      }),
    );

    const test = Layer.mergeAll(
      Layer.provideMerge(
        InstantHttpAuthedLive,
        Layer.merge(
          InstantHttpLive.pipe(Layer.provide(NodeHttpClient.layer)),
          Layer.succeed(AuthToken, {
            authToken: app.app.adminToken,
            source: 'env',
          }),
        ),
      ),

      Layer.succeed(GlobalOpts, { yes: true }),
    ).pipe(
      Layer.provideMerge(
        Layer.succeed(CurrentApp, {
          appId: app.app.id,
          source: 'env',
          adminToken: app.app.adminToken,
        }),
      ),
    );
    return test;
  }).pipe(Effect.provide(PlatformApi.Default));
