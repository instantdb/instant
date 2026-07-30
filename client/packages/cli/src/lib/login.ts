import { Effect, Schedule, Schema } from 'effect';
import { InstantHttp, withCommand } from './http.ts';
import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { saveConfigAuthToken as saveAuthTokenForApi } from '../auth.ts';
import { getBaseUrl } from '../util/apiUrl.ts';

const LoginInfo = Schema.Struct({
  secret: Schema.String,
  ticket: Schema.String,
});

const TokenResult = Schema.Struct({
  token: Schema.String,
  email: Schema.String,
});

export const getLoginTicketAndSecret = Effect.gen(function* () {
  const http = yield* InstantHttp;
  const res = yield* http
    .pipe(withCommand('login'))
    .post('/dash/cli/auth/register')
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(LoginInfo)));
  return res;
});

export const waitForAuthToken = Effect.fn(function* (secret: string) {
  const http = (yield* InstantHttp).pipe(withCommand('login'));
  const res = yield* HttpClientRequest.post('/dash/cli/auth/check').pipe(
    HttpClientRequest.bodyUnsafeJson({
      secret,
    }),
    http.execute,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResult)),
    Effect.retry({
      while: (e) =>
        e._tag === 'InstantHttpError' &&
        e.hint?.errors?.at(0)?.issue === 'waiting-for-user',
      schedule: Schedule.fixed('1 seconds'),
      times: 120,
    }),
  );
  return res;
});

export const saveConfigAuthToken = Effect.fn(function* (token: string) {
  const apiUrl = yield* getBaseUrl;
  yield* Effect.tryPromise(() => saveAuthTokenForApi(apiUrl, token));
});
