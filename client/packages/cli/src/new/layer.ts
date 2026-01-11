import { NodeContext, NodeHttpClient } from '@effect/platform-node';
import chalk from 'chalk';
import { Cause, Console, Effect, Layer } from 'effect';
import {
  InstantHttp,
  InstantHttpAuthedLive,
  InstantHttpLive,
} from './lib/http.js';
import { AuthTokenLive } from './context/authToken.js';
import { PlatformApi } from './context/platformApi.js';
import { GlobalOptsLive } from './context/globalOpts.js';

export const printRedErrors = Effect.catchAllCause((cause) => {
  const failure = Cause.failureOption(cause);
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
  Layer.provide(
    InstantHttpAuthedLive,
    Layer.merge(AuthTokenLayer, InstantHttpLayer),
  ),
  BaseLayerLive,
);
