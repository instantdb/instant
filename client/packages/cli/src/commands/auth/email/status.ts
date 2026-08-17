import boxen from 'boxen';
import chalk from 'chalk';
import { Effect, Option, Schema } from 'effect';
import { CurrentApp } from '../../../context/currentApp.ts';
import type { authEmailStatusDef, OptsFromCommand } from '../../../index.ts';
import { InstantHttpAuthed } from '../../../lib/http.ts';
import { HttpClientResponse } from '@effect/platform';
import { getVerification } from '../../../lib/email.ts';

const formatValue = (value: string | number | null | undefined) =>
  value ?? 'n/a';

const formatVerified = (value: boolean | null | undefined) => {
  if (value === true) {
    return chalk.green('verified');
  }
  if (value === false) {
    return chalk.yellow('pending');
  }
  return 'n/a';
};

const formatDnsRecord = (type: string, name: string, value: string) =>
  [chalk.bold(type), `Name:  ${name}`, `Value: ${value}`].join('\n');

export const formatSenderVerificationDnsRecords = (verification: {
  Confirmed: boolean;
  DKIMPendingHost?: string | null;
  DKIMPendingTextValue?: string | null;
  ReturnPathDomain?: string | null;
  ReturnPathDomainCNAMEValue?: string | null;
  DnsRecords?: ReadonlyArray<{
    Type: string;
    Name: string;
    Value: string;
  }> | null;
}) =>
  boxen(
    [
      chalk.bold('Add these DNS records to verify your sender email:'),
      '',
      ...(verification.DnsRecords?.length
        ? verification.DnsRecords.flatMap((record, index) => [
            formatDnsRecord(record.Type, record.Name, record.Value),
            ...(index < verification.DnsRecords!.length - 1 ? [''] : []),
          ])
        : [
            formatDnsRecord(
              'TXT',
              verification.DKIMPendingHost ?? 'n/a',
              verification.DKIMPendingTextValue ?? 'n/a',
            ),
            '',
            formatDnsRecord(
              'CNAME',
              verification.ReturnPathDomain ?? 'n/a',
              verification.ReturnPathDomainCNAMEValue ?? 'n/a',
            ),
          ]),
    ].join('\n'),
    {
      borderColor: verification.Confirmed ? 'green' : 'yellow',
      padding: { right: 1, left: 1 },
    },
  );

export const EmailTemplateInfoSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String.pipe(Schema.NullishOr),
  name: Schema.String,
  sender_id: Schema.String.pipe(Schema.NullishOr),
  app_id: Schema.String,
  postmark_id: Schema.Number.pipe(Schema.NullishOr),
  email_provider: Schema.String.pipe(Schema.NullishOr),
  provider_id: Schema.String.pipe(Schema.NullishOr),
  verification_verified: Schema.Boolean.pipe(Schema.NullishOr),
  verification_id: Schema.String.pipe(Schema.NullishOr),
  email_type: Schema.String,
  body: Schema.String,
  subject: Schema.String,
});

export type EmailTemplateInfo = typeof EmailTemplateInfoSchema.Type;

export const EmailTemplateSchema = Schema.Union(
  Schema.Struct({
    info: EmailTemplateInfoSchema.pipe(Schema.NullishOr),
  }),
  Schema.Null,
);

export const getEmailTemplateStatus = Effect.gen(function* () {
  const { appId } = yield* CurrentApp;
  const http = yield* InstantHttpAuthed;

  const app = yield* http
    .get(`/dash/apps/${appId}/email_status`)
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(EmailTemplateSchema)),
    );
  return app?.info;
});

export const emailStatusCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authEmailStatusDef>,
) {
  const info = yield* getEmailTemplateStatus;

  if (!info) {
    yield* Effect.log(
      "No custom magic code email associated with this app.\nTo add one, run 'instant-cli auth email pull', edit the file, then run 'instant-cli auth email push'",
    );
    return;
  }

  const verification = yield* Option.match(
    Option.fromNullable(info.sender_id),
    {
      onNone: () => Effect.succeed(null),
      onSome: () => getVerification,
    },
  );

  if (opts.json) {
    const fullInfo = verification
      ? {
          ...info,
          verification: verification,
        }
      : info;

    yield* Effect.log(JSON.stringify(fullInfo, null, 2));
    return;
  }

  yield* Effect.log(chalk.cyan('Custom Magic Code Email'));
  yield* Effect.log(`  Sender name: ${info.name}`);
  yield* Effect.log(`  Sender email: ${formatValue(info.email)}`);
  yield* Effect.log(`  Subject: ${info.subject}`);
  yield* Effect.log(`  Body: ${info.body}`);

  if (verification) {
    yield* Effect.log(
      '\n' +
        boxen(
          [
            `Instant verified: ${formatVerified(verification.instant['verified?'])}`,
            `${verification.verification?.Provider === 'ses' ? 'Amazon SES' : 'Postmark'} verified: ${formatVerified(verification.verification?.Confirmed)}`,
          ].join('\n'),
          {
            title: 'Custom Sender Verification',
            borderColor:
              verification.instant['verified?'] &&
              verification.verification?.Confirmed
                ? 'green'
                : 'yellow',
            padding: { right: 1, left: 1 },
          },
        ),
    );

    if (verification.verification) {
      yield* Effect.log(
        '\n' + formatSenderVerificationDnsRecords(verification.verification),
      );
    }
  }
});
