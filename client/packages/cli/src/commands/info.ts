import { HttpClientResponse } from '@effect/platform';
import { Effect, Schema, Option } from 'effect';
import { InstantHttpAuthed } from '../lib/http.ts';
import { version } from '@instantdb/version';
import { CurrentApp } from '../context/currentApp.ts';

const DashMeResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    created_at: Schema.String,
  }),
});

export const DashAppResponse = Schema.Struct({
  app: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
  }),
});

export const infoCommand = () =>
  Effect.gen(function* () {
    const authedHttp = yield* Effect.serviceOption(InstantHttpAuthed).pipe(
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

    if (Option.isSome(maybeApp) && authedHttp) {
      const appInfo = yield* authedHttp
        .get(`/dash/apps/${maybeApp.value.appId}`)
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DashAppResponse)),
        );

      yield* Effect.log(`App: ${appInfo.app.title} (${appInfo.app.id})`);
    }
  });
