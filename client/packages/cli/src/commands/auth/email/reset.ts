import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../../../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from '../../../lib/http.ts';
import { getDefaultEmailTemplate, writeEmailTemplate } from './pull.ts';
import { getEmailTemplateStatus } from './status.ts';

export const authEmailResetCmd = Effect.fn(function* () {
  const { appId } = yield* CurrentApp;
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth email reset'));

  const status = yield* getEmailTemplateStatus;

  if (!status) {
    yield* Effect.log(
      'No email template configured. Resetting local email template.',
    );
  } else {
    yield* http
      .execute(
        HttpClientRequest.del(
          `/dash/apps/${appId}/email_templates/${status.id}`,
        ),
      )
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));
  }

  const defaultConfig = yield* getDefaultEmailTemplate;

  yield* writeEmailTemplate(defaultConfig, {
    confirmOverwrite: false,
  });

  yield* Effect.log(
    'instant.email.ts file reset to default. To apply this change, run instant-cli auth email push',
  );
});
