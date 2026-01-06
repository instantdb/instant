import { HttpClient, HttpClientRequest } from '@effect/platform';
import { Config, Context, Effect, Layer, Option } from 'effect';
import { AuthToken } from '../context/authToken.js';

export class InstantHttp extends Context.Tag(
  'instant-cli/new/lib/http/InstantHttp',
)<InstantHttp, HttpClient.HttpClient>() {}

export class InstantHttpAuthed extends Context.Tag(
  'instant-cli/new/lib/http/InstantHttpAuthed',
)<InstantHttpAuthed, HttpClient.HttpClient>() {}

export const InstantHttpLive = Layer.effect(
  InstantHttp,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const baseUrl = yield* getBaseUrl;
    return client.pipe(
      HttpClient.mapRequest((r) =>
        r.pipe(HttpClientRequest.prependUrl(baseUrl)),
      ),
      HttpClient.filterStatusOk, // makes non 2xx http codes error
    );
  }),
);

export const InstantHttpAuthedLive = Layer.effect(
  InstantHttpAuthed,
  Effect.gen(function* () {
    const http = yield* InstantHttp;
    const { authToken } = yield* AuthToken;
    return http.pipe(
      HttpClient.mapRequest((r) =>
        r.pipe(
          HttpClientRequest.setHeader('Authorization', `Bearer ${authToken}`),
        ),
      ),
    );
  }),
);

export const getBaseUrl = Effect.gen(function* () {
  const setEnv = yield* Config.string('INSTANT_CLI_API_URI').pipe(
    Config.option,
  );
  const dev = yield* Config.boolean('INSTANT_CLI_DEV').pipe(
    Config.withDefault(false),
  );

  return Option.match(setEnv, {
    onSome: (url) => url,
    onNone: () => {
      return dev ? 'http://localhost:8888' : 'https://api.instantdb.com';
    },
  });
});

export const getDashUrl = Effect.gen(function* () {
  const dev = Option.getOrNull(
    yield* Config.boolean('INSTANT_CLI_DEV').pipe(Config.option),
  );
  return dev ? 'http://localhost:3000' : 'https://instantdb.com';
});
