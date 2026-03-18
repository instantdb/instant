import { HttpClient, HttpClientRequest } from '@effect/platform';
import { version } from '@instantdb/version';
import { Config, Context, Data, Effect, Layer, Option, Schema } from 'effect';
import { AuthToken } from '../context/authToken.js';
import { TimeoutException } from 'effect/Cause';
import { RequestError } from '@effect/platform/HttpClientError';

export class InstantHttp extends Context.Tag(
  'instant-cli/new/lib/http/InstantHttp',
)<
  InstantHttp,
  HttpClient.HttpClient.With<InstantHttpError | TimeoutException | RequestError>
>() {}

export class InstantHttpAuthed extends Context.Tag(
  'instant-cli/new/lib/http/InstantHttpAuthed',
)<
  InstantHttpAuthed,
  HttpClient.HttpClient.With<InstantHttpError | TimeoutException | RequestError>
>() {}

export class InstantHttpError extends Data.TaggedError('InstantHttpError')<{
  message: string;
  type: string;
  methodAndUrl: string;
  hint?: Record<string, any>;
}> {}

// Pipe on a client to set command header
export const withCommand = (command: string) => {
  return (client: HttpClient.HttpClient.With<InstantHttpError>) =>
    client.pipe(
      HttpClient.mapRequest((r) =>
        r.pipe(HttpClientRequest.setHeader(`X-Instant-Command`, command)),
      ),
    );
};

class InstantTypicalHttpErrorResponse extends Schema.Struct({
  message: Schema.String,
  type: Schema.String.pipe(Schema.optional),
  hint: Schema.Record({ key: Schema.String, value: Schema.Any }).pipe(
    Schema.optional,
  ),
}) {}

export const InstantHttpLive = Layer.effect(
  InstantHttp,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const baseUrl = yield* getBaseUrl;
    return client.pipe(
      HttpClient.mapRequest((r) =>
        r.pipe(
          HttpClientRequest.prependUrl(baseUrl),
          HttpClientRequest.setHeader('X-Instant-Source', 'instant-cli'),
          HttpClientRequest.setHeader('X-Instant-Version', version),
        ),
      ),
      HttpClient.transformResponse((r) => r.pipe(Effect.timeout('5 minutes'))),
      HttpClient.filterStatusOk, // makes non 2xx http codes error
      HttpClient.transformResponse((r) =>
        r.pipe(
          Effect.catchTag('ResponseError', (requestError) =>
            Effect.gen(function* () {
              const jsonBody = yield* requestError.response.json.pipe(
                Effect.andThen(
                  Schema.decodeUnknown(InstantTypicalHttpErrorResponse),
                ),
                Effect.mapError(
                  (e) =>
                    new InstantHttpError({
                      message:
                        'Error making request to ' + requestError.methodAndUrl,
                      type: e._tag,
                      methodAndUrl: requestError.methodAndUrl,
                    }),
                ),
              );
              return yield* new InstantHttpError({
                message: jsonBody.message,
                methodAndUrl: requestError.methodAndUrl,
                hint: jsonBody.hint,
                type: jsonBody.type || 'Unknown type',
              });
            }),
          ),
        ),
      ),
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
