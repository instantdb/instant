import { NodeContext, NodeHttpClient } from '@effect/platform-node';
import { Cause, Effect, Layer, ManagedRuntime } from 'effect';
import { AuthTokenLive } from './context/authToken.ts';
import { CurrentAppLive } from './context/currentApp.ts';
import { GlobalOptsLive } from './context/globalOpts.ts';
import { PlatformApi } from './context/platformApi.ts';
import {
  PACKAGE_ALIAS_AND_FULL_NAMES,
  ProjectInfoLive,
} from './context/projectInfo.ts';
import {
  InstantHttpAuthedLive,
  InstantHttpError,
  InstantHttpLive,
} from './lib/http.ts';
import { SimpleLogLayer } from './logging.ts';

const runtime = ManagedRuntime.make(SimpleLogLayer);

export const runCommandEffect = <A, E, R extends never>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> => runtime.runPromise(effect.pipe(printRedErrors) as any);

export const printRedErrors = Effect.catchAllCause((cause) =>
  Effect.gen(function* () {
    const failure = Cause.failureOption(cause);

    // This should never happen because the catchAllCause should only fire when there IS a failure
    if (failure._tag !== 'Some') {
      return;
    }

    const theError = failure.value;

    // Special error handling for specific error types
    if (theError instanceof InstantHttpError) {
      if (theError?.message) {
        yield* Effect.logError(
          'Error making request to Instant API: ' + theError.message,
        );
      }
      if (Array.isArray(theError?.hint?.errors)) {
        for (const err of theError.hint.errors) {
          yield* Effect.logError(
            `${err.in ? err.in.join('->') + ': ' : ''}${err.message}`,
          );
        }
      }
      return process.exit(1);
    }

    // Print just the message if the error has a message attribute and no cause
    if (
      typeof failure.value === 'object' &&
      failure.value !== null &&
      'message' in failure.value &&
      typeof failure.value.message === 'string' &&
      !('cause' in failure.value)
    ) {
      return yield* Effect.logError(failure.value.message).pipe(
        Effect.tap(() => {
          process.exit(1);
        }),
      );
    }

    return yield* Effect.logError(
      Cause.pretty(cause, { renderErrorCause: true }),
    ).pipe(
      Effect.tap(() => {
        process.exit(1);
      }),
    );
  }),
);

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
  coerceLibraryInstall?: boolean;
  packageName?: keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES;
  allowAdminToken?: boolean;
  applyEnv?: boolean;
  temp?: boolean;
}) =>
  Layer.mergeAll(
    CurrentAppLive({
      coerce: args.coerce,
      appId: args.appId,
      title: args.title,
      applyEnv: args.applyEnv,
      temp: args.temp,
    }),
  ).pipe(
    Layer.provideMerge(
      AuthLayerLive({
        allowAdminToken:
          args.allowAdminToken !== undefined ? args.allowAdminToken : true,
        coerce: args.coerceAuth ?? false,
      }),
    ),
    Layer.provideMerge(
      ProjectInfoLive(
        args.coerceLibraryInstall ?? args.coerce,
        args.packageName,
      ),
    ),
    Layer.provideMerge(BaseLayerLive),
  );
