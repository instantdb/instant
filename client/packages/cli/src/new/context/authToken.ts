import { FileSystem } from '@effect/platform';
import { program } from 'commander';
import { Config, Context, Effect, Layer, Option, Schema } from 'effect';
import envPaths from 'env-paths';
import { join } from 'path';

export class AuthToken extends Context.Tag('instant-cli/new/context/authToken')<
  AuthToken,
  {
    authToken: string;
    source: 'env' | 'opt' | 'file';
  }
  // the authtoken resolves to a string when yielded
>() {}

export class NotAuthedError extends Schema.TaggedError<NotAuthedError>(
  'NotAuthedError',
)('NotAuthedError', {
  message: Schema.String,
}) {}

export const AuthTokenLive = Layer.effect(
  AuthToken,
  Effect.gen(function* () {
    const options = program.opts();
    if (typeof options.token === 'string') {
      return {
        authToken: options.token,
        source: 'opt',
      };
    }

    const env = Option.getOrNull(
      yield* Config.string('INSTANT_CLI_AUTH_TOKEN').pipe(Config.option),
    );
    if (env) {
      return {
        authToken: env,
        source: 'env',
      };
    }

    const authPaths = yield* getAuthPaths;
    const fs = yield* FileSystem.FileSystem;
    const file = yield* fs
      .readFileString(authPaths.authConfigFilePath, 'utf8')
      .pipe(
        Effect.mapError(
          (e) => new Error("Couldn't read auth file", { cause: e }),
        ),
      );

    if (file) {
      return {
        authToken: file,
        source: 'file',
      };
    }

    return yield* NotAuthedError.make({ message: 'You are not logged in' });
  }),
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
