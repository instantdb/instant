import { HttpClientResponse, Path } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { ProjectInfo } from '../../../context/projectInfo.ts';
import { BadArgsError } from '../../../errors.ts';
import { readLocalEmailFile } from '../../../old.js';
import { UI } from '../../../ui/index.ts';
import { getEmailPathToWrite } from '../../../util/findConfigCandidates.ts';
import { writeTypescript } from '../../../lib/pullSchema.ts';
import { promptOk } from '../../../lib/ui.ts';
import { getEmailTemplateStatus, type EmailTemplateInfo } from './status.ts';
import type { authEmailPullDef, OptsFromCommand } from '../../../index.ts';
import { InstantHttp } from '../../../lib/http.ts';
import { getAppName } from '../../../util/getAppName.ts';
import type { EmailConfig } from '../../../lib/email.ts';

export const authEmailPullCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authEmailPullDef>,
) {
  yield* pullEmail(opts.file);
});

export type EmailConfig = (typeof EmailConfig.Type)['authEmail'];

type WriteEmailTemplateOpts = {
  emailPath?: string;
  confirmOverwrite?: boolean;
};

const pullEmail = (emailPath?: string) =>
  Effect.gen(function* () {
    yield* Effect.log('Pulling email template...');

    const info = yield* getEmailTemplateStatus;

    const emailConfig = info
      ? infoToEmailConfig(info)
      : yield* getDefaultEmailTemplate;

    yield* writeEmailTemplate(emailConfig, { emailPath });
  });

export const writeEmailTemplate = (
  emailConfig: EmailConfig,
  { emailPath, confirmOverwrite = true }: WriteEmailTemplateOpts = {},
) =>
  Effect.gen(function* () {
    const prevEmailFile = yield* Effect.tryPromise({
      try: () => readLocalEmailFile(emailPath),
      catch: (e) =>
        BadArgsError.make({
          message: `Error reading local email file: ${e}`,
        }),
    });

    const shortEmailPath =
      prevEmailFile?.path ?? emailPath ?? getEmailPathToWrite();

    if (prevEmailFile && confirmOverwrite) {
      const shouldContinue = yield* promptOk({
        promptText: `This will overwrite your local ${shortEmailPath} file, OK to proceed?`,
        modifyOutput: UI.modifiers.yPadding,
        inline: true,
      });
      if (!shouldContinue) {
        yield* Effect.log('Cancelled email pull');
        return;
      }
    }

    const path = yield* Path.Path;
    const { pkgDir } = yield* ProjectInfo;
    const fullEmailPath = shortEmailPath.startsWith('/')
      ? shortEmailPath
      : path.join(pkgDir, shortEmailPath);

    const typescriptFile = yield* generateEmailTypescriptFile(emailConfig);

    yield* writeTypescript(fullEmailPath, typescriptFile);
    yield* Effect.log('Wrote email template to ' + shortEmailPath);
  });

const DefaultEmailTemplateSchema = Schema.Struct({
  subject: Schema.String,
  body: Schema.String,
  'sender-email': Schema.String.pipe(Schema.optional),
});

export const getDefaultEmailTemplate = Effect.gen(function* () {
  const http = yield* InstantHttp;
  const template = yield* http
    .get('/dash/default-email-template')
    .pipe(
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(DefaultEmailTemplateSchema),
      ),
    );

  const appName = yield* getAppName;

  return {
    subject: template.subject,
    senderName: appName,
    senderEmail: template['sender-email'],
    body: template.body,
  };
});

const infoToEmailConfig = (info: EmailTemplateInfo) => ({
  subject: info.subject,
  senderName: info.name,
  senderEmail: info.email,
  body: info.body,
});

const generateEmailTypescriptFile = Effect.fn(function* (
  emailConfig: EmailConfig,
) {
  const senderEmail = emailConfig.senderEmail
    ? JSON.stringify(emailConfig.senderEmail)
    : 'undefined';

  return `
  // We provide a few dynamic variables for you to use in your email:
  // {code}, the magic code e.g. 123456
  // {app_title}, your app's title, i.e. test-fresh
  // {user_email}, the user's email address, e.g. happyuser@gmail.com
  // {expiration}, the magic code expiration, e.g. 10 minutes
  // Note: {code} is required in both the subject and body.
  const email = {
  authEmail: {
    subject: ${JSON.stringify(emailConfig.subject)},
    senderName: ${JSON.stringify(emailConfig.senderName)},
    senderEmail: ${senderEmail},
    body: ${toTemplateLiteral(emailConfig.body)},
  },
};

export default email;
`;
});

const toTemplateLiteral = (value: string) =>
  `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
