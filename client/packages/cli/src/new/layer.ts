import { NodeContext, NodeHttpClient } from '@effect/platform-node';
import chalk from 'chalk';
import { Cause, Console, Effect, Layer } from 'effect';
import { InstantHttpAuthedLive, InstantHttpLive } from './lib/http.js';
import { AuthTokenLive } from './context/authToken.js';
import { PlatformApi } from './context/platformApi.js';
import { GlobalOptsLive } from './context/globalOpts.js';
import {
  PACKAGE_ALIAS_AND_FULL_NAMES,
  ProjectInfoLive,
} from './context/projectInfo.js';
import { CurrentAppLive } from './context/currentApp.js';

export const printRedErrors = Effect.catchAllCause((cause) => {
  const failure = Cause.failureOption(cause);

  // Print just the message if the error has a message attribute and no cause
  if (
    failure._tag === 'Some' &&
    typeof failure.value === 'object' &&
    failure.value !== null &&
    'message' in failure.value &&
    !('cause' in failure.value)
  ) {
    return Console.error(
      chalk.red((failure.value as { message: string }).message),
    );
  }
  return Console.error(
    chalk.red(Cause.pretty(cause, { renderErrorCause: true })),
  );
});

/**
 * Note:
 Avoid Duplicate Layer Creation

 Layers are memoized using reference equality. Therefore, if you have a layer that is created by calling a function like f(), you should only call that f once and re-use the resulting layer so that you are always using the same instance.
 */

// Base layers
const AuthTokenLayer = Layer.provide(AuthTokenLive, NodeContext.layer);
const InstantHttpLayer = Layer.provide(InstantHttpLive, NodeHttpClient.layer);

// Unauthenticated layer with InstantHttp + PlatformApi + GlobalOpts + NodeContext
export const BaseLayerLive = Layer.provideMerge(
  Layer.mergeAll(InstantHttpLayer, PlatformApi.Default, GlobalOptsLive),
  NodeContext.layer,
);

// Authenticated layer extends BaseLayerLive with InstantHttpAuthed
export const AuthLayerLive = Layer.provideMerge(
  Layer.provideMerge(
    InstantHttpAuthedLive,
    Layer.merge(AuthTokenLayer, InstantHttpLayer),
  ),
  BaseLayerLive,
);

export const WithAppLayer = (args: {
  appId?: string;
  title?: string;
  coerce: boolean;
  packageName?: keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES;
  applyEnv?: boolean;
}) =>
  Layer.mergeAll(
    CurrentAppLive({
      coerce: args.coerce,
      appId: args.appId,
      title: args.title,
      applyEnv: args.applyEnv,
    }),
  ).pipe(
    Layer.provideMerge(GlobalOptsLive),
    Layer.provideMerge(AuthLayerLive),
    Layer.provideMerge(ProjectInfoLive(args.coerce, args.packageName)),
  );
