import { Effect, Schema } from 'effect';
import type { authEmailPushDef, OptsFromCommand } from '../../../index.ts';
import {
  getVerification,
  readEmailConfig,
  sendSenderVerification,
} from '../../../lib/email.ts';
import { CurrentApp } from '../../../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from '../../../lib/http.ts';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import boxen from 'boxen';
import {
  formatSenderVerificationDnsRecords,
  getEmailTemplateStatus,
} from './status.ts';
import chalk from 'chalk';

export const authEmailPushCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authEmailPushDef>,
) {
  const emailConfig = yield* readEmailConfig(opts.file);
  const { appId } = yield* CurrentApp;
  const http = yield* InstantHttpAuthed;
  const authEmail = emailConfig.authEmail;
  const senderEmail = authEmail.senderEmail;

  yield* http
    .pipe(
      withCommand('auth email push'),
      HttpClient.mapRequestInputEffect(
        HttpClientRequest.bodyJson({
          'email-type': 'magic-code',
          subject: authEmail.subject,
          body: authEmail.body,
          'sender-email': senderEmail,
          'sender-name': authEmail.senderName,
        }),
      ),
    )
    .post(`/dash/apps/${appId}/email_templates`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));

  const info = yield* getEmailTemplateStatus;

  yield* Effect.log(
    [
      chalk.green('Email template saved!'),
      '',
      chalk.bold('Pushed fields:'),
      `  Email type: ${chalk.cyan('magic-code')}`,
      `  Subject: ${chalk.cyan(authEmail.subject)}`,
      `  Sender name: ${chalk.cyan(authEmail.senderName)}`,
      `  Sender email: ${chalk.cyan(senderEmail || '(default)')}`,
      `  Body: ${chalk.cyan(`${authEmail.body.length} characters`)}`,
    ].join('\n'),
  );

  // Check if verification email needs to be sent

  if (info?.verification_verified === false) {
    yield* sendSenderVerification;
    yield* Effect.log(
      boxen(
        "We've sent a confirmation email containing a six digit code to verify the sender email address.\nUse instant-cli auth email verify <code> to complete verification.",
        {
          borderColor: 'yellow',
          padding: { right: 1, left: 1 },
        },
      ),
    );
  }

  if (emailConfig.authEmail.senderEmail) {
    const verification = yield* getVerification;
    if (verification.verification) {
      yield* Effect.log(
        formatSenderVerificationDnsRecords(verification.verification),
      );
    }
  }
});
