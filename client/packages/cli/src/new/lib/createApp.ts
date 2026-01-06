import { randomUUID } from 'crypto';
import { Effect, Schema } from 'effect';
import { InstantHttpAuthed } from './http.js';
import { HttpClientRequest, HttpClientResponse } from '@effect/platform';

export const createApp = Effect.fn(function* (title: string, orgId?: string) {
  const http = yield* InstantHttpAuthed;
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };

  const res = yield* HttpClientRequest.post('/dash/apps').pipe(
    HttpClientRequest.bodyJson(app),
    Effect.flatMap(http.execute),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)),
  );
  return res;
});
