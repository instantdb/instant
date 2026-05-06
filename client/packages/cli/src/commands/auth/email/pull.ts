import { HttpClientResponse, Path } from '@effect/platform';
import { defaultMagicCodeEmailConfig } from '@instantdb/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../../../context/currentApp.ts';
import { ProjectInfo } from '../../../context/projectInfo.ts';
import { BadArgsError } from '../../../errors.ts';
import { readLocalEmailFile } from '../../../old.js';
import { UI } from '../../../ui/index.ts';
import { getEmailPathToWrite } from '../../../util/findConfigCandidates.ts';
import { InstantHttpAuthed, withCommand } from '../../../lib/http.ts';
import { writeTypescript } from '../../../lib/pullSchema.ts';
import { promptOk } from '../../../lib/ui.ts';

type AuthEmailPullOpts = {
  file?: string;
};

export const authEmailPullCmd = Effect.fn(function* (opts: AuthEmailPullOpts) {
  yield* pullEmail(opts.file);
});

const NullableString = Schema.Union(Schema.String, Schema.Null);

const EmailTemplate = Schema.Struct({
  id: Schema.String,
  app_id: Schema.String,
  email_type: Schema.String,
  body: Schema.String,
  name: Schema.String,
  subject: Schema.String,
  email: NullableString,
  postmark_id: Schema.Union(Schema.Number, Schema.Null),
});

const PullEmailResponse = Schema.Union(
  Schema.Struct({
    template: Schema.Union(EmailTemplate, Schema.Null),
  }),
  EmailTemplate,
  Schema.Null,
);

type EmailConfig = {
  subject: string;
  from: string;
  fromAddress: string | undefined;
  body: string;
};

const pullEmail = (emailPath?: string) =>
  Effect.gen(function* () {
    yield* Effect.log('Pulling email template...');

    const { appId } = yield* CurrentApp;
    const http = (yield* InstantHttpAuthed).pipe(
      withCommand('auth email pull'),
    );

    const emailState = yield* http
      .get(`/dash/apps/${appId}/email_templates`)
      .pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(PullEmailResponse)),
      );

    const template =
      emailState && 'template' in emailState ? emailState.template : emailState;

    const emailConfig = template
      ? templateToEmailConfig(template)
      : defaultMagicCodeEmailConfig.authEmail;

    if (!template) {
      yield* Effect.log(
        'No custom email template configured. Writing defaults.',
      );
    }

    const prevEmailFile = yield* Effect.tryPromise({
      try: () => readLocalEmailFile(emailPath),
      catch: (e) =>
        BadArgsError.make({
          message: `Error reading local email file: ${e}`,
        }),
    });

    const shortEmailPath =
      prevEmailFile?.path ?? emailPath ?? getEmailPathToWrite();

    if (prevEmailFile) {
      const shouldContinue = yield* promptOk({
        promptText: `This will overwrite your local ${shortEmailPath} file, OK to proceed?`,
        modifyOutput: UI.modifiers.yPadding,
        inline: true,
      });
      if (!shouldContinue) return;
    }

    const path = yield* Path.Path;
    const { pkgDir } = yield* ProjectInfo;
    const fullEmailPath = shortEmailPath.startsWith('/')
      ? shortEmailPath
      : path.join(pkgDir, shortEmailPath);

    yield* writeTypescript(
      fullEmailPath,
      generateEmailTypescriptFile(emailConfig),
    );
    yield* Effect.log('Wrote email template to ' + shortEmailPath);
  });

const templateToEmailConfig = (template: typeof EmailTemplate.Type) => ({
  subject: template.subject,
  from: template.name,
  fromAddress: template.email ?? undefined,
  body: template.body,
});

const generateEmailTypescriptFile = (emailConfig: EmailConfig) => {
  const fromAddress = emailConfig.fromAddress
    ? JSON.stringify(emailConfig.fromAddress)
    : 'undefined';

  return `const email = {
  authEmail: {
    subject: ${JSON.stringify(emailConfig.subject)},
    from: ${JSON.stringify(emailConfig.from)},
    fromAddress: ${fromAddress},
    body: ${toTemplateLiteral(emailConfig.body)},
  },
};

export default email;
`;
};

const toTemplateLiteral = (value: string) =>
  `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
