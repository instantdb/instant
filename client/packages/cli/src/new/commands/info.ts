import { Effect, Schema } from 'effect';
import { AuthToken, authTokenGetEffect } from '../context/authToken.js';
import { AuthLayerLive } from '../layer.js';
import { InstantHttpAuthed } from '../lib/http.js';
import { HttpClientResponse } from '@effect/platform';

const DashMeResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    created_at: Schema.String,
  }),
});

export const infoCommand = () =>
  Effect.gen(function* () {
    const http = yield* InstantHttpAuthed;
    const meData = yield* http
      .get('/dash/me')
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(DashMeResponse)));

    console.log(`Logged in as ${meData.user.email}`);
  }).pipe(
    Effect.provide(AuthLayerLive),
    Effect.catchTag('NotAuthedError', () =>
      Effect.gen(function* () {
        console.log('Not logged in.');
      }),
    ),
  );
