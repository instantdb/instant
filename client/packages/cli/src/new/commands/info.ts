import { HttpClientResponse } from '@effect/platform';
import { Effect, Layer, pipe, Schema, Option } from 'effect';
import { AuthLayerLive } from '../layer.js';
import { InstantHttpAuthed } from '../lib/http.js';
import { version } from '@instantdb/version';

const DashMeResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    created_at: Schema.String,
  }),
});

export const infoCommand = () =>
  Effect.gen(function* () {
    const http = yield* Effect.serviceOption(InstantHttpAuthed).pipe(
      Effect.map(Option.getOrNull),
    );

    yield* Effect.log('CLI Version:', version);
    // If logged in..
    if (http) {
      const meData = yield* http.get('/dash/me').pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DashMeResponse)),
        Effect.mapError(
          (e) => new Error("Couldn't get user information.", { cause: e }),
        ),
      );

      yield* Effect.log(`Logged in as ${meData.user.email}`);
    } else {
      yield* Effect.log('Not logged in.');
    }
  }).pipe(
    Effect.provide(
      AuthLayerLive({
        coerce: false,
        allowAdminToken: false,
      }).pipe(Layer.catchAll((e) => Layer.empty)),
    ),
  );
