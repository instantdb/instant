import { Effect, Schedule, Schema } from 'effect';
import { InstantHttp } from './http.js';
import {
  HttpClientRequest,
  HttpClientResponse,
  FileSystem,
} from '@effect/platform';
import { getAuthPaths } from '../../util/getAuthPaths.js';

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
    .post('/dash/cli/auth/register')
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(LoginInfo)));
  return res;
});

export const waitForAuthToken = Effect.fn(function* (secret: string) {
  const http = yield* InstantHttp;
  const res = yield* HttpClientRequest.post('/dash/cli/auth/check').pipe(
    HttpClientRequest.bodyJson({
      secret,
    }),
    Effect.flatMap(http.execute),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResult)),
    Effect.retry({
      schedule: Schedule.fixed('1 seconds'),
      times: 12,
    }),
  );
  return res;
});

export const saveConfigAuthToken = Effect.fn(function* (token: string) {
  const authPaths = getAuthPaths();

  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(authPaths.appConfigDirPath, { recursive: true });
  yield* fs.writeFileString(authPaths.authConfigFilePath, token);
});
