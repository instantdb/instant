import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { Effect, Schema, Option } from 'effect';
import { InstantHttp, InstantHttpAuthed } from '../lib/http.ts';
import { version } from '@instantdb/version';
import { CurrentApp } from '../context/currentApp.ts';

const DashMeResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    created_at: Schema.String,
  }),
});

const DashAppResponse = Schema.Struct({
  app: Schema.Struct({
    id: Schema.String,
  }),
});

export const infoCommand = () =>
  Effect.gen(function* () {
    const authedHttp = yield* Effect.serviceOption(InstantHttpAuthed).pipe(
      Effect.map(Option.getOrNull),
    );
    const http = yield* Effect.serviceOption(InstantHttp).pipe(
      Effect.map(Option.getOrNull),
    );
    const maybeApp = yield* Effect.serviceOption(CurrentApp);

    yield* Effect.log('CLI Version:', version);
    // If logged in..
    if (authedHttp) {
      const meData = yield* authedHttp.get('/dash/me').pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DashMeResponse)),
        Effect.mapError(
          (e) => new Error("Couldn't get user information.", { cause: e }),
        ),
      );

      yield* Effect.log(`Logged in as ${meData.user.email}`);
    } else {
      yield* Effect.log('Not logged in.');
    }

    if (Option.isSome(maybeApp) && (authedHttp || http)) {
      const app = maybeApp.value;
      const appHttp =
        app.adminToken && http
          ? http.pipe(
              HttpClient.mapRequest((request) =>
                request.pipe(
                  HttpClientRequest.setHeader(
                    'Authorization',
                    `Bearer ${app.adminToken}`,
                  ),
                ),
              ),
            )
          : authedHttp;

      if (!appHttp) return;

      const appInfo = yield* appHttp
        .get(`/dash/apps/${app.appId}`)
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DashAppResponse)),
          Effect.option,
        );

      if (Option.isSome(appInfo)) {
        yield* Effect.log(`App: ${appInfo.value.app.id}`);
      }
    }
  });
