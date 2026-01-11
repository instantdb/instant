import { program } from 'commander';
import { Config, Context, Effect, Layer, Option, Schema } from 'effect';

export class AuthToken extends Context.Tag('instant-cli/new/context/authToken')<
  AuthToken,
  {
    authToken: string;
    source: 'env' | 'opt';
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

    return yield* NotAuthedError.make({ message: 'You are not logged in' });
  }),
);
