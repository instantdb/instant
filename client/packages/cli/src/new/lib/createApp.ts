import { randomUUID } from 'crypto';
import { Data, Effect, Schema } from 'effect';
import { InstantHttpAuthed } from './http.js';
import { HttpClientRequest, HttpClientResponse } from '@effect/platform';

export class CreateAppError extends Data.TaggedError('CreateAppError')<{
  message: string;
}> {}

export const createApp = Effect.fn(
  function* (title: string, orgId?: string) {
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
  },
  Effect.catchTag(
    'HttpBodyError',
    (e) => new CreateAppError({ message: 'Error constructing http body' }),
  ),
);
