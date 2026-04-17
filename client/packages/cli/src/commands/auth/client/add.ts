import { Effect, Match, Option, Schema } from 'effect';
import type { authClientAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import {
  optOrPrompt,
  runUIEffect,
  stripFirstBlankLine,
  validateRequired,
} from '../../../lib/ui.ts';
import {
  addOAuthClient,
  addOAuthProvider,
  getAppsAuth,
} from '../../../lib/oauth.ts';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_DEFAULT_CALLBACK_URL,
  GOOGLE_DISCOVERY_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from '@instantdb/platform';
import { UI } from '../../../ui/index.ts';
import chalk from 'chalk';
import boxen from 'boxen';

const ClientTypeSchema = Schema.Literal(
  'google',
  'github',
  // 'apple',
  // 'linkedin',
  // 'clerk',
  // 'firebase',
);

const GoogleAppTypeSchema = Schema.Literal(
  'web',
  'ios',
  'android',
  'button-for-web',
);

const selectGoogleAppType = (value: unknown) =>
  Effect.gen(function* () {
    const { yes } = yield* GlobalOpts;

    return yield* Option.fromNullable(value).pipe(
      Effect.catchTag('NoSuchElementException', () => {
        if (yes) {
          return BadArgsError.make({
            message: `Missing required value for --app-type. Expected one of: ${GoogleAppTypeSchema.literals.join(', ')}`,
          });
        }

        return runUIEffect(
          new UI.Select({
            options: [
              {
                label:
                  'Web' + chalk.dim(' (Redirect Flows or Expo Auth Session)'),
                value: 'web',
              },
              { label: 'iOS', value: 'ios' },
              { label: 'Android', value: 'android' },
              { label: 'Google Button for Web', value: 'button-for-web' },
            ],
            promptText: 'Select a Google app type:',
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.dimOnComplete,
            ]),
            defaultValue: 'web',
          }),
        ).pipe(
          Effect.catchTag('UIError', (e) =>
            BadArgsError.make({ message: `UI error: ${e.message}` }),
          ),
        );
      }),
      Effect.andThen((raw) => Schema.decodeUnknown(GoogleAppTypeSchema)(raw)),
      Effect.catchTag('ParseError', () =>
        BadArgsError.make({
          message:
            'Invalid app-type, must be one of: web, ios, android, button-for-web',
        }),
      ),
    );
  });

// If user has clients google-web-1 and google-web-2, it will provide google-web-3
const findName = (prefix: string, used: Set<string>) => {
  if (!used.has(prefix)) {
    return prefix;
  }

  for (let i = 2; ; i++) {
    const candidate = `${prefix}${i}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
};

const getOrCreateProvider = Effect.fn(function* (
  type: typeof ClientTypeSchema.Type,
) {
  const auth = yield* getAppsAuth();
  const provider = auth.oauth_service_providers?.find(
    (entry) => entry.provider_name === type,
  );

  if (provider) {
    return { auth, provider };
  }

  const created = yield* addOAuthProvider({ providerName: type });
  return { auth, provider: created.provider };
});

const handleGoogleClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const appType = yield* selectGoogleAppType(opts['app-type']);
  const { auth, provider } = yield* getOrCreateProvider('google');
  const usedClientNames = new Set(
    (auth.oauth_clients ?? []).map((client) => client.client_name),
  );
  const suggestedClientName = findName(`google-${appType}`, usedClientNames);

  const clientName = yield* optOrPrompt(opts.name, {
    simpleName: '--name',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'Client Name:',
      defaultValue: suggestedClientName,
      placeholder: suggestedClientName,
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
    },
  });

  if (usedClientNames.has(clientName || '')) {
    return yield* BadArgsError.make({
      message: `The unique name '${clientName}' is already in use.`,
    });
  }

  const clientId = yield* optOrPrompt(opts['client-id'], {
    simpleName: '--client-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Client ID ${chalk.dim('(from https://console.developers.google.com/apis/credentials)')}`,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: validateRequired,
    },
  });

  const clientSecret = yield* optOrPrompt(opts['client-secret'], {
    required: appType === 'web',
    skipIf: appType !== 'web',
    simpleName: '--client-secret',
    prompt: {
      prompt: `Client Secret: ${chalk.dim('(from https://console.developers.google.com/apis/credentials)')}`,
      validate: validateRequired,
      sensitive: true,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const customRedirectUri = yield* optOrPrompt(opts['custom-redirect-uri'], {
    required: false,
    prompt: {
      prompt: '',
      placeholder: 'https://yoursite.com/oauth/callback',
      modifyOutput: UI.modifiers.piped([
        (output, status) => {
          if (status === 'idle') {
            return (
              `\nCustom redirect URI (optional):
${chalk.dim('With a custom redirect URI, users will see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim('Your URI must forward to https://api.instantdb.com/runtime/oauth/callback with all query parameters preserved.')}\n\n` +
              stripFirstBlankLine(output)
            );
          }
          return `\nCustom redirect URI (optional):\n${stripFirstBlankLine(output)}`;
        },
        UI.modifiers.dimOnComplete,
      ]),
    },
    simpleName: '--custom-redirect-uri',
    skipIf: appType !== 'web',
    skipMessage: 'Provided custom redirect URI when not using web app type.',
  });

  if (!clientName) {
    return yield* BadArgsError.make({ message: 'Client name is required.' }); // Should never reach this
  }
  const redirectUri = customRedirectUri || GOOGLE_DEFAULT_CALLBACK_URL;

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId,
    clientSecret: clientSecret,
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    discoveryEndpoint: GOOGLE_DISCOVERY_ENDPOINT,
    redirectTo: redirectUri,
    meta: {
      appType,
      skipNonceChecks: true,
    },
  });

  const redirectMessages: string[] = [];
  if (appType === 'web') {
    redirectMessages.push(
      chalk.bold(
        `\nAdd this redirect URI in Google Console:\n${redirectUri}\n`,
      ),
    );
    if (customRedirectUri) {
      redirectMessages.push(
        `Your custom redirect must forward to ${chalk.bold(GOOGLE_DEFAULT_CALLBACK_URL)} with all query parameters preserved.`,
      );
      redirectMessages.push(
        `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
      );
    }
  }

  yield* Effect.log(
    boxen(
      [
        `Google OAuth client created: ${response.client.client_name}`,
        `App type: ${appType}`,
        `ID: ${response.client.id}`,
        `Google Client ID: ${response.client.client_id ?? clientId}`,
        ...redirectMessages,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const GITHUB_DEFAULT_CALLBACK_URL =
  'https://api.instantdb.com/runtime/oauth/callback';

const handleGithubClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const { auth, provider } = yield* getOrCreateProvider('github');
  const usedClientNames = new Set(
    (auth.oauth_clients ?? []).map((client) => client.client_name),
  );
  const suggestedClientName = findName('github-web', usedClientNames);

  const clientName = yield* optOrPrompt(opts.name, {
    simpleName: '--name',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'Client Name:',
      defaultValue: suggestedClientName,
      placeholder: suggestedClientName,
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
    },
  });

  if (usedClientNames.has(clientName || '')) {
    return yield* BadArgsError.make({
      message: `The unique name '${clientName}' is already in use.`,
    });
  }

  const clientId = yield* optOrPrompt(opts['client-id'], {
    simpleName: '--client-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Client ID ${chalk.dim('(from https://github.com/settings/developers)')}`,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: validateRequired,
    },
  });

  const clientSecret = yield* optOrPrompt(opts['client-secret'], {
    required: true,
    skipIf: false,
    simpleName: '--client-secret',
    prompt: {
      prompt: `Client Secret: ${chalk.dim('(from https://github.com/settings/developers)')}`,
      validate: validateRequired,
      sensitive: true,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const customRedirectUri = yield* optOrPrompt(opts['custom-redirect-uri'], {
    required: false,
    simpleName: '--custom-redirect-uri',
    skipIf: false,
    prompt: {
      prompt: '',
      placeholder: 'https://yoursite.com/oauth/callback',
      modifyOutput: UI.modifiers.piped([
        (output, status) => {
          if (status === 'idle') {
            return (
              `\nCustom redirect URI (optional):
${chalk.dim('With a custom redirect URI, users will see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim('Your URI must forward to https://api.instantdb.com/runtime/oauth/callback with all query parameters preserved.')}\n\n` +
              stripFirstBlankLine(output)
            );
          }
          return `\nCustom redirect URI (optional):\n${stripFirstBlankLine(output)}`;
        },
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  if (!clientName) {
    return yield* BadArgsError.make({ message: 'Client name is required.' });
  }

  const redirectUri = customRedirectUri || GITHUB_DEFAULT_CALLBACK_URL;

  // The backend infers GitHub's authorization/token endpoints from
  // meta.providerName === 'github', so we don't pass them here.
  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId,
    clientSecret,
    redirectTo: redirectUri,
    meta: { providerName: 'github' },
  });

  const redirectMessages: string[] = [
    chalk.bold(
      `\nAdd this callback URL in your GitHub OAuth App settings:\n${redirectUri}\n`,
    ),
  ];
  if (customRedirectUri) {
    redirectMessages.push(
      `Your custom redirect must forward to ${chalk.bold(GITHUB_DEFAULT_CALLBACK_URL)} with all query parameters preserved.`,
    );
    redirectMessages.push(
      `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
    );
  }

  yield* Effect.log(
    boxen(
      [
        `GitHub OAuth client created: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `GitHub Client ID: ${response.client.client_id ?? clientId}`,
        ...redirectMessages,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

export const authClientAddCmd = Effect.fn(
  function* (
    opts: OptsFromCommand<typeof authClientAddDef> & Record<string, unknown>,
  ) {
    const { yes } = yield* GlobalOpts;
    if (!opts.type && yes) {
      return yield* BadArgsError.make({
        message: `Missing required value for --type. Expected one of: ${ClientTypeSchema.literals.join(', ')}`,
      });
    }
    const clientType = yield* Option.fromNullable(opts.type).pipe(
      Effect.catchTag('NoSuchElementException', () =>
        runUIEffect(
          new UI.Select({
            options: [
              { label: 'Google', value: 'google' },
              { label: 'GitHub', value: 'github' },
              // TODO: implement
              // { label: 'Apple', value: 'apple' },
              // { label: 'LinkedIn', value: 'linkedin' },
              // { label: 'Clerk', value: 'clerk' },
              // { label: 'Firebase', value: 'firebase' },
            ],
            promptText: 'Select a client type:',
            modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
          }),
        ),
      ),
      Effect.andThen((s) => Schema.decodeUnknown(ClientTypeSchema)(s)),
      Effect.catchTag('ParseError', () =>
        BadArgsError.make({
          message:
            'Invalid client type, must be one of: google, apple, github, linkedin, clerk, firebase',
        }),
      ),
    );

    yield* Match.value(clientType).pipe(
      Match.withReturnType<Effect.Effect<void, any, any>>(),
      Match.when('google', () => handleGoogleClient(opts)),
      Match.when('github', () => handleGithubClient(opts)),
      // Match.when('apple', () => Effect.logError('Not Implemented')),
      // Match.when('clerk', () => Effect.logError('Not Implemented')),
      // Match.when('firebase', () => Effect.logError('Not Implemented')),
      // Match.when('linkedin', () => Effect.logError('Not Implemented')),
      Match.exhaustive,
    );
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli auth client add --help` for the list of available arguments',
        ),
      );
    }),
  ),
);
