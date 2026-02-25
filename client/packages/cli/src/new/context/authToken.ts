import { FileSystem } from '@effect/platform';
import { program } from 'commander';
import { Config, Context, Effect, Layer, Option, Schema } from 'effect';
import envPaths from 'env-paths';
import { join } from 'path';
import { loginCommand } from '../commands/login.js';
import { SystemError } from '@effect/platform/Error';

export class AuthToken extends Context.Tag('instant-cli/new/context/authToken')<
  AuthToken,
  {
    authToken: string;
    source: 'env' | 'opt' | 'file';
  }
>() {}

export class NotAuthedError extends Schema.TaggedError<NotAuthedError>(
  'NotAuthedError',
)('NotAuthedError', {
  message: Schema.String,
}) {}

export const authTokenGetEffect = Effect.gen(function* () {
  const options = program.opts();
  if (typeof options.token === 'string') {
    return {
      authToken: options.token,
      source: 'opt' as 'env' | 'opt' | 'file',
    };
  }

  const env = Option.getOrNull(
    yield* Config.string('INSTANT_CLI_AUTH_TOKEN').pipe(Config.option),
  );
  if (env) {
    return {
      authToken: env,
      source: 'env' as 'env' | 'opt' | 'file',
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

export const AuthTokenLive = Layer.effect(AuthToken, authTokenGetEffect);

export const AuthTokenCoerceLive = Layer.effect(
  AuthToken,
  authTokenGetEffect.pipe(
    Effect.catchTag('NotAuthedError', () =>
      loginCommand({
        print: true,
        headless: true,
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
