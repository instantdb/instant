import { randomUUID } from 'crypto';
import { Effect, Schema } from 'effect';

class CreateAppError extends Schema.TaggedError<CreateAppError>(
  'CreateAppError',
)('CreateAppError', {
  message: Schema.String,
}) {}

export const createApp = Effect.fn(function* (title: string, orgId: string) {
  const id = randomUUID();
  const token = randomUUID();
  const app = { id, title, admin_token: token, org_id: orgId };
});
