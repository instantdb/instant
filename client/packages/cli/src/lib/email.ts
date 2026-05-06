import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import chalk from 'chalk';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { BadArgsError } from '../errors.ts';
import { readLocalEmailFile } from '../old.js';
import { InstantHttpAuthed, withCommand } from './http.ts';

const EmailConfig = Schema.Struct({
  authEmail: Schema.Struct({
    subject: Schema.String,
    from: Schema.String,
    fromAddress: Schema.optional(Schema.String),
    body: Schema.String,
  }),
});

export class NoEmailFileFound extends Schema.TaggedError<NoEmailFileFound>(
  'NoEmailFileFound',
)('NoEmailFileFound', {
  message: Schema.String,
}) {}

export const readEmailConfig = (emailPath?: string) =>
  Effect.gen(function* () {
    const emailFile = yield* Effect.tryPromise({
      try: () => readLocalEmailFile(emailPath),
      catch: (e) =>
        BadArgsError.make({
          message: `Error reading instant.email.ts file: ${e}`,
        }),
    });

    if (!emailFile) {
      return yield* NoEmailFileFound.make({
        message:
          "We couldn't find your `instant.email.ts` file. Make sure it's in the root directory. (Hint: You can use an INSTANT_EMAIL_FILE_PATH environment variable to specify it.)",
      });
    }

    return yield* Schema.decodeUnknown(EmailConfig)(emailFile.email).pipe(
      Effect.catchTag('ParseError', (e) =>
        BadArgsError.make({
          message: `Invalid instant.email.ts file: ${e.message}`,
        }),
      ),
    );
  });

export const pushEmail = (emailPath?: string) =>
  Effect.gen(function* () {
    const emailConfig = yield* readEmailConfig(emailPath);
    const { appId } = yield* CurrentApp;
    const http = yield* InstantHttpAuthed;
    const authEmail = emailConfig.authEmail;
    const senderEmail = authEmail.fromAddress;

    yield* http
      .pipe(
        withCommand('auth email push'),
        HttpClient.mapRequestInputEffect(
          HttpClientRequest.bodyJson({
            'email-type': 'magic-code',
            subject: authEmail.subject,
            body: authEmail.body,
            'sender-email': senderEmail,
            'sender-name': authEmail.from,
          }),
        ),
      )
      .post(`/dash/apps/${appId}/email_templates`)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));

    yield* Effect.log(
      [
        chalk.green('Email template saved!'),
        '',
        chalk.bold('Pushed fields:'),
        `  Email type: ${chalk.cyan('magic-code')}`,
        `  Subject: ${chalk.cyan(authEmail.subject)}`,
        `  Sender name: ${chalk.cyan(authEmail.from)}`,
        `  Sender email: ${chalk.cyan(senderEmail || '(default)')}`,
        `  Body: ${chalk.cyan(`${authEmail.body.length} characters`)}`,
      ].join('\n'),
    );
  });
