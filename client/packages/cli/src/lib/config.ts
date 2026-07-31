import { Config, Effect, Option, Schema } from 'effect';
import { BadArgsError } from '../errors.ts';
import { readInstantConfigFile } from '../util/instantConfig.ts';

const HttpUrl = Schema.URL.pipe(
  Schema.filter(
    (url) =>
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      'Expected an HTTP(S) URL',
  ),
);

export const getBaseUrl = Effect.gen(function* () {
  const setEnv = yield* Config.string('INSTANT_CLI_API_URI').pipe(
    Config.option,
  );
  const dev = yield* Config.boolean('INSTANT_CLI_DEV').pipe(
    Config.withDefault(false),
  );

  if (Option.isSome(setEnv)) {
    return setEnv.value;
  }

  const instantConfig = yield* Effect.tryPromise(readInstantConfigFile);
  if (instantConfig?.apiURI !== undefined) {
    yield* Schema.decodeUnknown(HttpUrl)(instantConfig.apiURI).pipe(
      Effect.mapError(() =>
        BadArgsError.make({
          message:
            'Invalid apiURI in instant.config.ts. Expected a valid HTTP(S) URL.',
        }),
      ),
    );
    return instantConfig.apiURI;
  }

  return dev ? 'http://localhost:8888' : 'https://api.instantdb.com';
});

export const getDashUrl = Effect.gen(function* () {
  const setEnv = yield* Config.string('INSTANT_CLI_DASH_URI').pipe(
    Config.option,
  );
  const dev = yield* Config.boolean('INSTANT_CLI_DEV').pipe(
    Config.withDefault(false),
  );

  if (Option.isSome(setEnv)) {
    return setEnv.value;
  }

  const instantConfig = yield* Effect.tryPromise(readInstantConfigFile);
  if (instantConfig?.dashURI !== undefined) {
    yield* Schema.decodeUnknown(HttpUrl)(instantConfig.dashURI).pipe(
      Effect.mapError(() =>
        BadArgsError.make({
          message:
            'Invalid dashURI in instant.config.ts. Expected a valid HTTP(S) URL.',
        }),
      ),
    );
    return instantConfig.dashURI;
  }

  return dev ? 'http://localhost:3000' : 'https://instantdb.com';
});
