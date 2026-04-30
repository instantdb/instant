import { Effect, Match, Option, Schema } from 'effect';
import { FileSystem } from '@effect/platform';
import type { authClientAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import {
  optOrPrompt,
  optOrPromptBoolean,
  runUIEffect,
  stripFirstBlankLine,
  validateRequired,
} from '../../../lib/ui.ts';
import {
  addOAuthClient,
  findName,
  getClientNameAndProvider,
  getOrCreateProvider,
  type OAuthClient,
} from '../../../lib/oauth.ts';
import {
  DEFAULT_OAUTH_CALLBACK_URL,
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_DISCOVERY_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  APPLE_AUTHORIZATION_ENDPOINT,
  APPLE_DISCOVERY_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  LINKEDIN_AUTHORIZATION_ENDPOINT,
  LINKEDIN_DISCOVERY_ENDPOINT,
  LINKEDIN_TOKEN_ENDPOINT,
} from '@instantdb/platform';
import { UI } from '../../../ui/index.ts';
import chalk from 'chalk';
import boxen from 'boxen';
import { link } from '../../../logging.ts';

export const ClientTypeSchema = Schema.Literal(
  'google',
  'github',
  'apple',
  'linkedin',
  'clerk',
  'firebase',
);

const GoogleAppTypeSchema = Schema.Literal(
  'web',
  'ios',
  'android',
  'button-for-web',
);

const isTrueFlag = (value: unknown) => value === true || value === 'true';

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

const selectGoogleCredentialMode = Effect.fn(function* () {
  return yield* runUIEffect(
    new UI.Select({
      options: [
        {
          label:
            'Use dev credentials' +
            chalk.dim(' (works on localhost and Expo, no Google setup)'),
          value: 'dev' as const,
        },
        {
          label:
            'Use my own credentials' +
            chalk.dim(' (client ID and secret from Google Console)'),
          value: 'custom' as const,
        },
      ],
      promptText: 'Select Google credential mode:',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      defaultValue: 'dev' as const,
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
});

const resolveGoogleCredentialMode = Effect.fn(function* ({
  appType,
  opts,
  yes,
}: {
  appType: typeof GoogleAppTypeSchema.Type;
  opts: Record<string, unknown>;
  yes: boolean;
}) {
  const devCredentialsFlag = isTrueFlag(opts['dev-credentials']);
  const hasProvidedSomeCustomCredentials = Boolean(
    opts['client-id'] || opts['client-secret'] || opts['custom-redirect-uri'],
  );

  if (devCredentialsFlag && appType !== 'web') {
    return yield* BadArgsError.make({
      message:
        '--dev-credentials is only supported for --app-type web. Native Google clients need credentials from Google.',
    });
  }

  if (devCredentialsFlag && hasProvidedSomeCustomCredentials) {
    return yield* BadArgsError.make({
      message:
        '--dev-credentials cannot be combined with --client-id, --client-secret, or --custom-redirect-uri.',
    });
  }

  if (appType !== 'web') {
    return 'custom';
  }

  if (hasProvidedSomeCustomCredentials) {
    return 'custom';
  }

  if (devCredentialsFlag) {
    return 'dev';
  }

  if (yes) {
    return 'dev';
  }

  return yield* selectGoogleCredentialMode();
});

const printGoogleDevCredentialsClient = Effect.fn(function* ({
  appType,
  client,
}: {
  appType: typeof GoogleAppTypeSchema.Type;
  client: OAuthClient;
}) {
  yield* Effect.log(
    boxen(
      [
        `Google OAuth client created: ${client.client_name}`,
        `App type: ${appType}`,
        `Credentials: Instant dev credentials`,
        `ID: ${client.id}`,
        '',
        'No Google Console setup required.',
        'Works on localhost and Expo during development.',
        '',
        'For production, use your own Google OAuth credentials.',
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const printGoogleCustomCredentialsClient = Effect.fn(function* ({
  appType,
  client,
  clientId,
  customRedirectUri,
  redirectUri,
}: {
  appType: typeof GoogleAppTypeSchema.Type;
  client: OAuthClient;
  clientId: string | undefined;
  customRedirectUri: string | undefined;
  redirectUri: string | undefined;
}) {
  const redirectMessages: string[] = [];
  if (appType === 'web' && redirectUri) {
    redirectMessages.push(
      chalk.bold(
        `\nAdd this redirect URI in Google Console:\n${redirectUri}\n`,
      ),
    );
    if (customRedirectUri) {
      redirectMessages.push(
        `Your custom redirect must forward to ${chalk.bold(DEFAULT_OAUTH_CALLBACK_URL)} with all query parameters preserved.`,
      );
      redirectMessages.push(
        `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
      );
    }
  }

  yield* Effect.log(
    boxen(
      [
        `Google OAuth client created: ${client.client_name}`,
        `App type: ${appType}`,
        `ID: ${client.id}`,
        `Google Client ID: ${client.client_id ?? clientId}`,
        ...redirectMessages,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const handleGoogleClient = Effect.fn(function* (opts: Record<string, unknown>) {
  // This one requires special logic for getting client name
  // because the suggested name includes the app type
  const appType = yield* selectGoogleAppType(opts['app-type']);
  const { yes } = yield* GlobalOpts;
  const credentialMode = yield* resolveGoogleCredentialMode({
    appType,
    opts,
    yes,
  });
  const useSharedCredentials = credentialMode === 'dev';

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
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  if (usedClientNames.has(clientName || '')) {
    return yield* BadArgsError.make({
      message: `The unique name '${clientName}' is already in use.`,
    });
  }

  const clientId = yield* optOrPrompt(opts['client-id'], {
    simpleName: '--client-id',
    required: !useSharedCredentials,
    skipIf: useSharedCredentials,
    skipMessage:
      '--client-id is not compatible with --dev-credentials. Drop one or the other.',
    prompt: {
      prompt: `Client ID: ${chalk.dim(`(from ${link('https://console.developers.google.com/apis/credentials')})`)}`,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: validateRequired,
    },
  });

  const usesCustomWebCredentials = !useSharedCredentials && appType === 'web';
  const clientSecret = yield* optOrPrompt(opts['client-secret'], {
    required: usesCustomWebCredentials,
    skipIf: !usesCustomWebCredentials,
    simpleName: '--client-secret',
    skipMessage: useSharedCredentials
      ? '--client-secret is not compatible with --dev-credentials. Drop one or the other.'
      : undefined,
    prompt: {
      prompt: `Client Secret: ${chalk.dim(`(from ${link('https://console.developers.google.com/apis/credentials')})`)}`,
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
${chalk.dim(`Your URI must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
              stripFirstBlankLine(output)
            );
          }
          return `\nCustom redirect URI (optional):\n${stripFirstBlankLine(output)}`;
        },
        UI.modifiers.dimOnComplete,
      ]),
    },
    simpleName: '--custom-redirect-uri',
    skipIf: !usesCustomWebCredentials,
    skipMessage: useSharedCredentials
      ? '--custom-redirect-uri is not compatible with --dev-credentials.'
      : 'Provided custom redirect URI when not using web app type.',
  });

  if (!clientName) {
    return yield* BadArgsError.make({ message: 'Client name is required.' }); // Should never reach this
  }
  const redirectUri = useSharedCredentials
    ? undefined
    : customRedirectUri || DEFAULT_OAUTH_CALLBACK_URL;

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId: useSharedCredentials ? undefined : clientId,
    clientSecret: useSharedCredentials ? undefined : clientSecret,
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    discoveryEndpoint: GOOGLE_DISCOVERY_ENDPOINT,
    redirectTo: redirectUri,
    meta: {
      appType,
      skipNonceChecks: true,
    },
    useSharedCredentials,
  });

  if (useSharedCredentials) {
    yield* printGoogleDevCredentialsClient({
      appType,
      client: response.client,
    });
    return;
  }

  yield* printGoogleCustomCredentialsClient({
    appType,
    client: response.client,
    clientId,
    customRedirectUri,
    redirectUri,
  });
});

const handleGithubClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const { clientName, provider } = yield* getClientNameAndProvider(
    'github',
    opts,
  );

  const clientId = yield* optOrPrompt(opts['client-id'], {
    simpleName: '--client-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Client ID ${chalk.dim(`(from ${link('https://github.com/settings/developers')})`)}`,
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
      prompt: `Client Secret: ${chalk.dim(`(from ${link('https://github.com/settings/developers')})`)}`,
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
${chalk.dim(`Your URI must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
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

  const redirectUri = customRedirectUri || DEFAULT_OAUTH_CALLBACK_URL;

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
      `Your custom redirect must forward to ${chalk.bold(DEFAULT_OAUTH_CALLBACK_URL)} with all query parameters preserved.`,
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

const handleLinkedInClient = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
  const { clientName, provider } = yield* getClientNameAndProvider(
    'linkedin',
    opts,
  );

  const clientId = yield* optOrPrompt(opts['client-id'], {
    simpleName: '--client-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Client ID: ${chalk.dim(`(from ${link('https://www.linkedin.com/developers/apps')})`)}`,
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
      prompt: `Client Secret: ${chalk.dim(`(from ${link('https://www.linkedin.com/developers/apps')})`)}`,
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
${chalk.dim(`Your URI must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
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

  const redirectUri = customRedirectUri || DEFAULT_OAUTH_CALLBACK_URL;

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId,
    clientSecret,
    authorizationEndpoint: LINKEDIN_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: LINKEDIN_TOKEN_ENDPOINT,
    discoveryEndpoint: LINKEDIN_DISCOVERY_ENDPOINT,
    redirectTo: redirectUri,
  });

  const redirectMessages: string[] = [
    chalk.bold(
      `\nAdd this redirect URI in your LinkedIn app settings:\n${redirectUri}\n`,
    ),
  ];
  if (customRedirectUri) {
    redirectMessages.push(
      `Your custom redirect must forward to ${chalk.bold(DEFAULT_OAUTH_CALLBACK_URL)} with all query parameters preserved.`,
    );
    redirectMessages.push(
      `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
    );
  }

  yield* Effect.log(
    boxen(
      [
        `LinkedIn OAuth client created: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `LinkedIn Client ID: ${response.client.client_id ?? clientId}`,
        ...redirectMessages,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const readPrivateKeyFile = Effect.fn('readPrivateKeyFile')(function* (
  path: string,
) {
  const fs = yield* FileSystem.FileSystem;
  // Strip shell-escape backslashes so paths like "file\ (2).p8" resolve correctly.
  // Only on POSIX — Windows uses backslashes as path separators.
  const normalizedPath =
    process.platform === 'win32' ? path : path.replace(/\\(.)/g, '$1');
  const contents = yield* fs.readFileString(normalizedPath, 'utf8').pipe(
    Effect.mapError(
      (e) =>
        new BadArgsError({
          message: `Could not read private key file at ${normalizedPath}: ${e.message}`,
        }),
    ),
  );

  const trimmed = contents.trim();
  if (!trimmed) {
    return yield* BadArgsError.make({
      message: `Private key file at ${normalizedPath} is empty.`,
    });
  }
  return trimmed;
});

const handleAppleClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const { yes } = yield* GlobalOpts;
  const { clientName, provider } = yield* getClientNameAndProvider(
    'apple',
    opts,
  );

  const servicesId = yield* optOrPrompt(opts['services-id'], {
    simpleName: '--services-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Services ID ${chalk.dim(`(from ${link('https://developer.apple.com/account/resources/identifiers/list/serviceId')})`)}`,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: validateRequired,
    },
  });

  // If any web-flow flag is provided, enable web flow; otherwise ask
  // (non-interactively with --yes we default to native-only).
  const anyWebFlagProvided = Boolean(
    opts['team-id'] || opts['key-id'] || opts['private-key-file'],
  );

  const configureWeb = anyWebFlagProvided
    ? true
    : yes
      ? false
      : yield* optOrPromptBoolean(undefined, {
          simpleName: '--configure-web',
          required: false,
          skipIf: false,
          prompt: {
            promptText:
              'Configure web redirect flow? ' +
              chalk.dim(
                '(requires Team ID, Key ID, and a .p8 private key from Apple)',
              ),
            defaultValue: false,
          },
        });

  const skipWeb = !configureWeb;
  const webSkipMessage =
    'requires configuring the web redirect flow (also provide --team-id, --key-id, and --private-key-file).';

  const teamId = yield* optOrPrompt(opts['team-id'], {
    simpleName: '--team-id',
    required: true,
    skipIf: skipWeb,
    skipMessage: `--team-id ${webSkipMessage}`,
    prompt: {
      prompt: `Team ID ${chalk.dim(`(from ${link('https://developer.apple.com/account#MembershipDetailsCard')})`)}`,
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const keyId = yield* optOrPrompt(opts['key-id'], {
    simpleName: '--key-id',
    required: true,
    skipIf: skipWeb,
    skipMessage: `--key-id ${webSkipMessage}`,
    prompt: {
      prompt: `Key ID ${chalk.dim(`(from ${link('https://developer.apple.com/account/resources/authkeys/list')})`)}`,
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const privateKeyPath = yield* optOrPrompt(opts['private-key-file'], {
    simpleName: '--private-key-file',
    required: true,
    skipIf: skipWeb,
    skipMessage: `--private-key-file ${webSkipMessage}`,
    prompt: {
      prompt: `Path to .p8 private key file ${chalk.dim('(downloaded from Apple)')}`,
      validate: validateRequired,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const privateKey = privateKeyPath
    ? yield* readPrivateKeyFile(privateKeyPath)
    : undefined;

  const customRedirectUri = yield* optOrPrompt(opts['custom-redirect-uri'], {
    required: false,
    simpleName: '--custom-redirect-uri',
    skipIf: skipWeb,
    skipMessage: `--custom-redirect-uri ${webSkipMessage}`,
    prompt: {
      prompt: '',
      placeholder: 'https://yoursite.com/oauth/callback',
      modifyOutput: UI.modifiers.piped([
        (output, status) => {
          if (status === 'idle') {
            return (
              `\nCustom redirect URI (optional):
${chalk.dim('With a custom redirect URI, users will see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim(`Your URI must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
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

  const redirectUri = privateKey
    ? customRedirectUri || DEFAULT_OAUTH_CALLBACK_URL
    : undefined;

  const meta: { teamId?: string; keyId?: string } = {};
  if (teamId !== undefined) meta.teamId = teamId;
  if (keyId !== undefined) meta.keyId = keyId;

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId: servicesId,
    clientSecret: privateKey,
    authorizationEndpoint: APPLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: APPLE_TOKEN_ENDPOINT,
    discoveryEndpoint: APPLE_DISCOVERY_ENDPOINT,
    redirectTo: redirectUri,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  });

  const summaryLines: string[] = [
    `Apple OAuth client created: ${response.client.client_name}`,
    `ID: ${response.client.id}`,
    `Services ID: ${response.client.client_id ?? servicesId}`,
  ];

  if (privateKey) {
    summaryLines.push(`Team ID: ${teamId}`);
    summaryLines.push(`Key ID: ${keyId}`);
    summaryLines.push(
      chalk.bold(
        `\nAdd this return URL under your Services ID on ${link('https://developer.apple.com', 'developer.apple.com')}:\n${redirectUri}\n`,
      ),
    );
    if (customRedirectUri) {
      summaryLines.push(
        `Your custom redirect must forward to ${chalk.bold(DEFAULT_OAUTH_CALLBACK_URL)} with all query parameters preserved.`,
      );
      summaryLines.push(
        `You can test it by visiting: ${chalk.bold(redirectUri + '?test-redirect=true')}`,
      );
    }
  }
  yield* Effect.log(
    boxen(summaryLines.join('\n'), {
      dimBorder: true,
      padding: { right: 1, left: 1 },
    }),
  );
});

const handleClerkClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const { clientName, provider } = yield* getClientNameAndProvider(
    'clerk',
    opts,
  );

  const publishableKey = yield* optOrPrompt(opts['publishable-key'], {
    simpleName: '--publishable-key',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Clerk publishable key ${chalk.dim(`(from ${link('https://dashboard.clerk.com/last-active?path=api-keys')})`)}`,
      placeholder:
        'pk_********************************************************',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: (val) => {
        if (!val) {
          return 'Publishable key is required';
        }
        if (!val.startsWith('pk_')) {
          return 'Invalid publishable key. It should start with "pk_".';
        }
      },
    },
  });

  if (!clientName) {
    return yield* BadArgsError.make({ message: 'Client name is required.' });
  }
  if (!publishableKey) {
    return yield* BadArgsError.make({
      message: 'Publishable key is required.',
    });
  }

  const domain = domainFromClerkKey(publishableKey);
  if (!domain) {
    return yield* BadArgsError.make({
      message: 'Invalid publishable key. Could not extract domain.',
    });
  }

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    discoveryEndpoint: `https://${domain}/.well-known/openid-configuration`,
    meta: { clerkPublishableKey: publishableKey },
  });

  const clerkDomain = response.client.discovery_endpoint?.replace(
    '/.well-known/openid-configuration',
    '',
  );

  yield* Effect.log(
    boxen(
      [
        `Clerk OAuth client created: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `Clerk Publishable Key: ${response.client.meta?.clerkPublishableKey}`,
        `Clerk Domain: ${clerkDomain}`,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );

  yield* Effect.log(
    '\nNavigate to your Clerk dashboard. On the Sessions page, click the Edit button in the Customize session token section.\nEnsure your Claims field has the email claim:\n' +
      boxen(
        `{
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}"
}`,
        { borderStyle: 'none' },
      ),
  );
});

const handleFirebaseClient = Effect.fn(function* (
  opts: OptsFromCommand<typeof authClientAddDef> & Record<string, unknown>,
) {
  const { clientName, provider } = yield* getClientNameAndProvider(
    'firebase',
    opts,
  );

  const firebaseProjectIdRegex = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  const projectId = yield* optOrPrompt(opts['project-id'], {
    simpleName: '--project-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `Firebase project ID: (From Project Settings page on ${link('https://console.firebase.google.com/')})`,
      placeholder: '',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: (val) => {
        if (!val) {
          return 'Project ID is required';
        }
        if (!firebaseProjectIdRegex.test(val)) {
          return 'Invalid Firebase project ID. It must be 6-30 characters, start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and not end with a hyphen.';
        }
      },
    },
  });
  // typeguard
  if (!clientName || !projectId) {
    return yield* BadArgsError.make({
      message: 'Missing required arguments',
    });
  }
  if (!firebaseProjectIdRegex.test(projectId)) {
    return yield* BadArgsError.make({
      message:
        'Invalid Firebase project ID. It must be 6-30 characters, start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and not end with a hyphen.',
    });
  }
  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    discoveryEndpoint: `https://securetoken.google.com/${encodeURIComponent(projectId)}/.well-known/openid-configuration`,
  });

  yield* Effect.log(
    boxen(
      [
        `Firebase OAuth client created: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `Firebase Project ID: ${projectId}`,
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
              { label: 'Apple', value: 'apple' },
              { label: 'LinkedIn', value: 'linkedin' },
              { label: 'Clerk', value: 'clerk' },
              { label: 'Firebase', value: 'firebase' },
            ],
            promptText: 'Select a client type:',
            modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
          }),
        ),
      ),
      Effect.andThen((s) => Schema.decodeUnknown(ClientTypeSchema)(s)),
      Effect.catchTag('ParseError', () =>
        BadArgsError.make({
          message: `Invalid client type, must be one of: ${ClientTypeSchema.literals.join(', ')}`,
        }),
      ),
    );

    yield* Match.value(clientType).pipe(
      Match.withReturnType<Effect.Effect<void, any, any>>(),
      Match.when('google', () => handleGoogleClient(opts)),
      Match.when('github', () => handleGithubClient(opts)),
      Match.when('apple', () => handleAppleClient(opts)),
      Match.when('linkedin', () => handleLinkedInClient(opts)),
      Match.when('clerk', () => handleClerkClient(opts)),
      Match.when('firebase', () => handleFirebaseClient(opts)),
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

function domainFromClerkKey(key: string): string | null {
  try {
    const parts = key.split('_');
    const domainPartB64 = parts[parts.length - 1];
    const domainPart = base64Decode(domainPartB64);
    return domainPart.replace('$', '');
  } catch (e) {
    console.error('Error getting domain from clerk key', e);
    return null;
  }
}

// Base64 decode, switching to url-safe decode if we hit an error
// Can't be sure which method Clerk uses because you can't generate
// `+` or `/` with characters that go in a normal host. Urls with
// chinese characters exist, they might encode to `+` or `/`, and
// Clerk might support them, so we'll be safe and do both.
function base64Decode(s: string) {
  try {
    return Buffer.from(s, 'base64').toString('utf-8');
  } catch (e) {
    return Buffer.from(s, 'base64url').toString('utf-8');
  }
}
