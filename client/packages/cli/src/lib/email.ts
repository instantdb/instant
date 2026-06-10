import { HttpBody, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { BadArgsError } from '../errors.ts';
import { readLocalEmailFile } from '../old.js';
import { InstantHttpAuthed } from './http.ts';

export const EmailConfig = Schema.Struct({
  authEmail: Schema.Struct({
    subject: Schema.String,
    senderName: Schema.String,
    senderEmail: Schema.optional(Schema.String),
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

export const sendSenderVerification = Effect.gen(function* () {
  const http = yield* InstantHttpAuthed;
  const { appId } = yield* CurrentApp;
  yield* http.post(`/dash/apps/${appId}/sender-verification/send-magic-code`);
});

export const submitVerification = Effect.fn(function* (code: string) {
  const http = yield* InstantHttpAuthed;
  const { appId } = yield* CurrentApp;
  yield* http.post(
    `/dash/apps/${appId}/sender-verification/verify-magic-code`,
    {
      body: HttpBody.unsafeJson({ code }),
    },
  );
});

const VerificationSchema = Schema.Struct({
  instant: Schema.Struct({
    'verified?': Schema.Boolean,
  }),
  verification: Schema.Struct({
    Confirmed: Schema.Boolean,
    ID: Schema.Number,
    EmailAddress: Schema.String,
    DKIMHost: Schema.String,
    ReturnPathDomain: Schema.String,
    DKIMPendingTextValue: Schema.String,
    ReturnPathDomainCNAMEValue: Schema.String,
    DKIMTextValue: Schema.String,
    DKIMPendingHost: Schema.String,
  }).pipe(Schema.NullishOr),
});

export const getVerification = Effect.gen(function* () {
  const http = yield* InstantHttpAuthed;
  const { appId } = yield* CurrentApp;

  const response = yield* http
    .get(`/dash/apps/${appId}/sender-verification`)
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(VerificationSchema)),
    );
  return response;
});
