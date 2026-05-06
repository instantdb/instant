import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../../../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from '../../../lib/http.ts';

const EmailTemplate = Schema.Struct({
  id: Schema.String,
});

const EmailTemplateResponse = Schema.Struct({
  template: Schema.Union(EmailTemplate, Schema.Null),
});

export const authEmailResetCmd = Effect.fn(function* () {
  const { appId } = yield* CurrentApp;
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth email reset'));

  const { template } = yield* http
    .get(`/dash/apps/${appId}/email_templates`)
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(EmailTemplateResponse)),
    );

  if (!template) {
    yield* Effect.log('No email template configured. Nothing to reset.');
    return;
  }

  yield* http
    .execute(
      HttpClientRequest.del(
        `/dash/apps/${appId}/email_templates/${template.id}`,
      ),
    )
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));

  yield* Effect.log('Email template reset.');
});
