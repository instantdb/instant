import { NodeContext, NodeHttpClient } from '@effect/platform-node';
import { Cause, Effect, Layer, ManagedRuntime } from 'effect';
import { AuthTokenLive } from './context/authToken.js';
import { CurrentAppLive } from './context/currentApp.js';
import { GlobalOptsLive } from './context/globalOpts.js';
import { PlatformApi } from './context/platformApi.js';
import {
  PACKAGE_ALIAS_AND_FULL_NAMES,
  ProjectInfoLive,
} from './context/projectInfo.js';
import { InstantHttpAuthedLive, InstantHttpLive } from './lib/http.js';
import { SimpleLogLayer } from './logging.js';

const runtime = ManagedRuntime.make(SimpleLogLayer);

export const runCommandEffect = <A, E, R extends never>(
  effect: Effect.Effect<A, E, R>,
): Promise<any> => runtime.runPromise(effect.pipe(printRedErrors) as any);

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
    return Effect.logError((failure.value as { message: string }).message).pipe(
      Effect.tap(() => {
        process.exit(1);
      }),
    );
  }
  return Effect.logError(Cause.pretty(cause, { renderErrorCause: true })).pipe(
    Effect.tap(() => {
      process.exit(1);
    }),
  );
});

/**
 * Note:
 Avoid Duplicate Layer Creation

 Layers are memoized using reference equality. Therefore, if you have a layer that is created by calling a function like f(), you should only call that f once and re-use the resulting layer so that you are always using the same instance.
 */

// TODO: make coerce param work for auth too

// Base layers
const AuthTokenLayer = ({
  allowAdminToken = true,
  coerce = false,
}: {
  allowAdminToken: boolean;
  coerce: boolean;
}) =>
  Layer.provide(AuthTokenLive({ allowAdminToken, coerce }), NodeContext.layer);

const InstantHttpLayer = Layer.provide(InstantHttpLive, NodeHttpClient.layer);

// Unauthenticated layer with InstantHttp + PlatformApi + GlobalOpts + NodeContext
export const BaseLayerLive = Layer.provideMerge(
  Layer.mergeAll(InstantHttpLayer, PlatformApi.Default, GlobalOptsLive),
  NodeContext.layer,
);

// Authenticated layer extends BaseLayerLive with InstantHttpAuthed
export const AuthLayerLive = ({
  allowAdminToken = true,
  coerce = false,
}: {
  allowAdminToken: boolean;
  coerce: boolean;
}) =>
  Layer.provideMerge(
    Layer.provideMerge(
      InstantHttpAuthedLive,
      Layer.merge(
        AuthTokenLayer({ allowAdminToken, coerce }),
        InstantHttpLayer,
      ),
    ),
    BaseLayerLive,
  );

export const WithAppLayer = (args: {
  appId?: string;
  title?: string;
  coerce: boolean;
  coerceAuth?: boolean;
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
    Layer.provideMerge(
      AuthLayerLive({
        allowAdminToken: true,
        coerce: args.coerceAuth || false,
      }),
    ),
    Layer.provideMerge(ProjectInfoLive(args.coerce, args.packageName)),
  );
