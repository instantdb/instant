import { Effect, Layer } from 'effect';
import { NodeHttpClient } from '@effect/platform-node';
import { PlatformApi } from '../src/new/context/platformApi.ts';
import { CurrentApp } from '../src/new/context/currentApp.ts';
import { InstantHttpAuthedLive, InstantHttpLive } from '../src/new/lib/http.ts';
import { AuthToken } from '../src/new/context/authToken.ts';
import { GlobalOpts } from '../src/new/context/globalOpts.ts';

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
