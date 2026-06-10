import { Effect } from 'effect';
import { InstantHttpAuthed } from '../lib/http.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { HttpClientResponse } from '@effect/platform';
import { DashAppResponse } from '../commands/info.ts';

export const getAppName = Effect.gen(function* () {
  const authedHttp = yield* InstantHttpAuthed;
  const { appId } = yield* CurrentApp;
  const appInfo = yield* authedHttp
    .get(`/dash/apps/${appId}`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(DashAppResponse)));
  return appInfo.app.title;
});
