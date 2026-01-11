import { Effect, Schema } from 'effect';
import { InstantHttp } from './http.js';
import { HttpClientResponse } from '@effect/platform';

const LoginInfo = Schema.Struct({
  secret: Schema.String,
  ticket: Schema.String,
});

export const getLoginTicketAndSecret = Effect.gen(function* () {
  const http = yield* InstantHttp;
  const res = yield* http
    .post('/dash/cli/auth/register')
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(LoginInfo)));
  return res;
});
