import { FileSystem } from '@effect/platform';
import { Config, Context, Effect, Layer, Option, Ref, Schema } from 'effect';
import envPaths from 'env-paths';
import { join } from 'node:path';
import { loginCommand } from '../commands/login.ts';
import { program } from '../program.ts';

type AuthTokenSource = 'admin' | 'env' | 'opt' | 'file';

type AuthTokenState = {
  authToken: string;
  source: AuthTokenSource;
};

export class AuthToken extends Context.Tag('instant-cli/new/context/authToken')<
  AuthToken,
  {
    getAuthToken: Effect.Effect<string>;
    getSource: Effect.Effect<AuthTokenSource>;
    setAuthToken: (
      authToken: string,
      source?: AuthTokenSource,
    ) => Effect.Effect<void>;
  }
>() {}

export class NotAuthedError extends Schema.TaggedError<NotAuthedError>(
  'NotAuthedError',
)('NotAuthedError', {
  message: Schema.String,
}) {}

export const authTokenGetEffect = (allowAdminToken: boolean = true) =>
  Effect.gen(function* () {
    const options = program.opts() as Record<string, any>;
    if (typeof options.token === 'string') {
      return {
        authToken: options.token,
        source: 'opt' as 'env' | 'opt' | 'file',
      };
    }

    const env = yield* Config.string('INSTANT_CLI_AUTH_TOKEN').pipe(
      Config.option,
      Config.map(Option.getOrNull),
    );

    if (env) {
      return {
        authToken: env,
        source: 'env' as 'env' | 'opt' | 'file',
      };
    }

    const secondaryEnv = yield* Config.string('INSTANT_APP_ADMIN_TOKEN').pipe(
      Config.orElse(() => Config.string('INSTANT_ADMIN_TOKEN')),
      Config.option,
      Config.map(Option.getOrNull),
    );
    if (secondaryEnv && allowAdminToken) {
      return {
        authToken: secondaryEnv,
        source: 'admin' as 'admin',
      };
    }

    const authPaths = yield* getAuthPaths;
    const fs = yield* FileSystem.FileSystem;
    const file = yield* fs
      .readFileString(authPaths.authConfigFilePath, 'utf8')
      .pipe(
        // will usually fail if file not found, return null instead
        Effect.orElseSucceed(() => null),
      );
    if (file) {
      return {
        authToken: file,
        source: 'file' as 'env' | 'opt' | 'file',
      };
    }

    return yield* NotAuthedError.make({ message: 'You are not logged in' });
  });

export const AuthTokenLive = ({
  coerce,
  allowAdminToken = true,
}: {
  coerce: boolean;
  allowAdminToken: boolean;
}) =>
  Layer.effect(
    AuthToken,
    authTokenGetEffect(allowAdminToken).pipe(
      Effect.flatMap((tokenResult) =>
        Effect.gen(function* () {
          const authStateRef = yield* Ref.make<AuthTokenState>(tokenResult);
          return {
            getAuthToken: Ref.get(authStateRef).pipe(
              Effect.map((authState) => authState.authToken),
            ),
            getSource: Ref.get(authStateRef).pipe(
              Effect.map((authState) => authState.source),
            ),
            setAuthToken: (authToken: string, source?: AuthTokenSource) =>
              Ref.update(authStateRef, (authState) => ({
                ...authState,
                authToken,
                source: source ?? authState.source,
              })),
          };
        }),
      ),
      Effect.catchTag('NotAuthedError', (e) =>
        Effect.gen(function* () {
          if (coerce) {
            const loginResult = yield* loginCommand({});
            const authStateRef = yield* Ref.make<AuthTokenState>(loginResult);
            return {
              getAuthToken: Ref.get(authStateRef).pipe(
                Effect.map((authState) => authState.authToken),
              ),
              getSource: Ref.get(authStateRef).pipe(
                Effect.map((authState) => authState.source),
              ),
              setAuthToken: (authToken: string, source?: AuthTokenSource) =>
                Ref.update(authStateRef, (authState) => ({
                  ...authState,
                  authToken,
                  source: source ?? authState.source,
                })),
            };
          } else {
            return yield* e;
          }
        }),
      ),
    ),
  );

const getAuthPaths = Effect.gen(function* () {
  const dev = yield* Config.boolean('INSTANT_CLI_DEV').pipe(
    Config.withDefault(false),
  );
  const key = `instantdb-${dev ? 'dev' : 'prod'}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, 'a');
  return { authConfigFilePath, appConfigDirPath };
});
