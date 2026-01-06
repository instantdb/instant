import { HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
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
    const http = yield* InstantHttpAuthed;
    const meData = yield* http
      .get('/dash/me')
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(DashMeResponse)));

    console.log('CLI Version:', version);
    console.log(`Logged in as ${meData.user.email}`);
  }).pipe(Effect.provide(AuthLayerLive(true)));
