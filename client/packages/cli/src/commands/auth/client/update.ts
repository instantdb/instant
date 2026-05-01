import { Effect, Match } from 'effect';
import type { authClientUpdateDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { getOptionalStringFlag, runUIEffect } from '../../../lib/ui.ts';
import {
  findClientByIdOrName,
  getAppsAuth,
  OAuthClient,
  updateOAuthClient,
} from '../../../lib/oauth.ts';
import { UI } from '../../../ui/index.ts';
import { DEFAULT_OAUTH_CALLBACK_URL } from '@instantdb/platform';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  appleKeyIdPrompt,
  applePrivateKeyFilePrompt,
  appleServicesIdPrompt,
  appleTeamIdPrompt,
  clerkPublishableKeyPrompt,
  clientIdPrompt,
  clientSecretPrompt,
  domainFromClerkKey,
  firebaseDiscoveryEndpoint,
  firebaseProjectIdPrompt,
  getFlag,
  getMetaString,
  hasAnyFlag,
  hasFlag,
  isTrueFlag,
  optOrPromptIf,
  readPrivateKeyFile,
  redirectSetupMessages,
  redirectUriPrompt,
  validateFirebaseProjectId,
} from './shared.ts';
import { link } from '../../../logging.ts';

type OAuthClientRow = typeof OAuthClient.Type;

type ProviderRow = {
  id: string;
  provider_name: string;
};

const redirectPrompt = redirectUriPrompt({
  heading: 'Custom redirect URI (optional):',
});
const newRedirectPrompt = redirectUriPrompt({ heading: 'New redirect URI:' });
const googleConsoleUrl =
  'https://console.developers.google.com/apis/credentials';

const resolveClient = Effect.fn(function* (params: {
  id?: string;
  name?: string;
  yes: boolean;
}) {
  if (params.id || params.name) {
    return yield* findClientByIdOrName({
      id: params.id,
      name: params.name,
    });
  }

  if (params.yes) {
    return yield* BadArgsError.make({ message: 'Must specify --id or --name' });
  }

  const auth = yield* getAppsAuth();
  const clients = (auth.oauth_clients ?? []) as OAuthClientRow[];

  if (clients.length === 0) {
    return yield* BadArgsError.make({
      message: 'No OAuth clients found for this app.',
    });
  }

  return yield* runUIEffect(
    new UI.Select({
      options: clients.map((client) => ({
        label:
          client.client_name +
          (client.use_shared_credentials
            ? chalk.dim(' (dev credentials)')
            : '') +
          chalk.dim(` (${client.id})`),
        value: client,
      })),
      promptText: 'Select a client to update:',
      modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
    Effect.map((client) => ({ auth, client })),
  );
});

const selectUpdateAction = Effect.fn(function* <T extends string>(
  options: { label: string; value: T }[],
) {
  return yield* runUIEffect(
    new UI.Select({
      options,
      promptText: 'What do you want to update?',
      modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
});

const updateGoogleToDevCredentials = Effect.fn(function* (
  client: OAuthClientRow,
) {
  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    clientId: null,
    clientSecret: null,
    useSharedCredentials: true,
    redirectTo: null,
  });

  yield* Effect.log(
    boxen(
      [
        `Google OAuth client updated: ${response.client.client_name}`,
        'Credentials: Instant dev credentials',
        `ID: ${response.client.id}`,
        '',
        'No Google Console setup required.',
        'Works on localhost and Expo during development.',
        '',
        chalk.bold('Ready for production? Run:'),
        `  instant-cli auth client update --name ${response.client.client_name} --client-id <id> --client-secret <secret>`,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

type GoogleUpdateMode = 'dev' | 'custom' | 'redirect';

const hasGoogleCustomCredentialFlags = (opts: Record<string, unknown>) =>
  hasAnyFlag(opts, ['client-id', 'client-secret', 'custom-redirect-uri']);

const hasGoogleUpdateFlags = (opts: Record<string, unknown>) =>
  isTrueFlag(getFlag(opts, 'dev-credentials')) ||
  hasGoogleCustomCredentialFlags(opts);

const selectGoogleUpdateMode = Effect.fn(function* ({
  isWeb,
}: {
  isWeb: boolean;
}) {
  const options: { label: string; value: GoogleUpdateMode }[] = [
    { label: 'Rotate credentials', value: 'custom' },
  ];

  if (isWeb) {
    options.push(
      {
        label:
          'Switch to Instant dev credentials' +
          chalk.dim(' (localhost and Expo, no Google setup)'),
        value: 'dev',
      },
      { label: 'Update redirect URI', value: 'redirect' },
    );
  }

  return yield* selectUpdateAction(options);
});

const resolveGoogleUpdateMode = Effect.fn(function* ({
  opts,
  isWeb,
  switchingFromShared,
  yes,
}: {
  opts: Record<string, unknown>;
  isWeb: boolean;
  switchingFromShared: boolean;
  yes: boolean;
}) {
  const devCredentialsFlag = isTrueFlag(getFlag(opts, 'dev-credentials'));
  const hasProvidedSomeCustomCredentials = hasGoogleCustomCredentialFlags(opts);

  if (devCredentialsFlag && !isWeb) {
    return yield* BadArgsError.make({
      message: '--dev-credentials is only supported for Google web clients.',
    });
  }

  if (
    !isWeb &&
    (hasFlag(opts, 'client-secret') || hasFlag(opts, 'custom-redirect-uri'))
  ) {
    return yield* BadArgsError.make({
      message:
        '--client-secret and --custom-redirect-uri are only supported for Google web clients.',
    });
  }

  if (devCredentialsFlag && hasProvidedSomeCustomCredentials) {
    return yield* BadArgsError.make({
      message:
        '--dev-credentials cannot be combined with --client-id, --client-secret, or --custom-redirect-uri.',
    });
  }

  if (devCredentialsFlag) {
    return 'dev';
  }

  const hasAnyUpdateFlag = hasGoogleUpdateFlags(opts);

  if (yes && !hasAnyUpdateFlag) {
    return yield* BadArgsError.make({
      message:
        'Must specify at least one of --client-id, --client-secret, --custom-redirect-uri, or --dev-credentials.',
    });
  }

  if (hasAnyUpdateFlag || switchingFromShared) {
    return 'custom';
  }

  return yield* selectGoogleUpdateMode({ isWeb });
});

const updateGoogleRedirect = Effect.fn(function* ({
  opts,
  client,
}: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
}) {
  const redirectTo = yield* optOrPromptIf(opts, 'custom-redirect-uri', {
    promptIf: true,
    required: true,
    prompt: newRedirectPrompt,
  });
  if (!redirectTo) {
    return yield* BadArgsError.make({
      message: 'Missing required value for --custom-redirect-uri',
    });
  }
  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    redirectTo,
  });
  yield* Effect.log(
    boxen(
      [
        `Google OAuth client updated: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        ...redirectSetupMessages({
          prompt: 'Add this redirect URI in Google Console',
          redirectUri: redirectTo,
          showCustomRedirectInstructions: true,
        }),
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const updateGoogleCustomCredentials = Effect.fn(function* ({
  opts,
  client,
  isWeb,
  switchingFromShared,
  promptCredentials,
}: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
  isWeb: boolean;
  switchingFromShared: boolean;
  promptCredentials: boolean;
}) {
  const mustCollectCredentials = promptCredentials || switchingFromShared;
  const shouldPromptClientId =
    promptCredentials || (switchingFromShared && !hasFlag(opts, 'client-id'));
  const shouldPromptClientSecret =
    isWeb &&
    (promptCredentials ||
      (switchingFromShared && !hasFlag(opts, 'client-secret')));
  const shouldPromptRedirectUri =
    isWeb && switchingFromShared && promptCredentials;

  const clientId = yield* optOrPromptIf(opts, 'client-id', {
    promptIf: shouldPromptClientId,
    required: mustCollectCredentials,
    prompt: clientIdPrompt({ providerUrl: googleConsoleUrl }),
  });
  const clientSecret = yield* optOrPromptIf(opts, 'client-secret', {
    promptIf: shouldPromptClientSecret,
    required: isWeb && mustCollectCredentials,
    prompt: clientSecretPrompt({ providerUrl: googleConsoleUrl }),
  });
  const customRedirectUri = isWeb
    ? yield* optOrPromptIf(opts, 'custom-redirect-uri', {
        promptIf: shouldPromptRedirectUri,
        required: false,
        prompt: redirectPrompt,
      })
    : undefined;

  const redirectTo = switchingFromShared
    ? customRedirectUri || client.redirect_to || DEFAULT_OAUTH_CALLBACK_URL
    : customRedirectUri;

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    clientId,
    clientSecret,
    redirectTo,
    useSharedCredentials: switchingFromShared ? false : undefined,
  });

  const lines = [
    `Google OAuth client updated: ${response.client.client_name}`,
    'Credentials: custom',
    `ID: ${response.client.id}`,
  ];

  if (switchingFromShared) {
    lines.push('', 'This client no longer uses Instant dev credentials.');
  }
  if (isWeb && redirectTo) {
    lines.push(
      ...redirectSetupMessages({
        prompt: 'Add this redirect URI in Google Console',
        redirectUri: redirectTo,
        showCustomRedirectInstructions: Boolean(customRedirectUri),
      }),
    );
  }

  yield* Effect.log(
    boxen(lines.join('\n'), {
      dimBorder: true,
      padding: { right: 1, left: 1 },
    }),
  );
});

const handleGoogleUpdate = Effect.fn(function* (
  opts: Record<string, unknown>,
  client: OAuthClientRow,
) {
  const { yes } = yield* GlobalOpts;
  const appType = getMetaString(client.meta, 'appType');
  const isWeb = appType === 'web' || !appType;
  const switchingFromShared = Boolean(client.use_shared_credentials);
  const hasAnyUpdateFlag = hasGoogleUpdateFlags(opts);

  if (!hasAnyUpdateFlag && !yes) {
    yield* Effect.log(
      `\nCurrent mode: ${
        switchingFromShared
          ? chalk.bold('Instant dev credentials')
          : 'custom credentials'
      }`,
    );
  }

  const updateMode = yield* resolveGoogleUpdateMode({
    opts,
    isWeb,
    switchingFromShared,
    yes,
  });

  if (updateMode === 'dev') {
    return yield* updateGoogleToDevCredentials(client);
  }

  if (updateMode === 'redirect') {
    return yield* updateGoogleRedirect({ opts, client });
  }

  return yield* updateGoogleCustomCredentials({
    opts,
    client,
    isWeb,
    switchingFromShared,
    promptCredentials: !hasAnyUpdateFlag && !yes,
  });
});

const handleClientIdSecretUpdate = Effect.fn(function* (params: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
  providerLabel: string;
  providerUrl: string;
  redirectSetupPrompt: string;
}) {
  const { yes } = yield* GlobalOpts;
  const hasAnyUpdateFlag = hasAnyFlag(params.opts, [
    'client-id',
    'client-secret',
    'custom-redirect-uri',
  ]);
  if (yes && !hasAnyUpdateFlag) {
    return yield* BadArgsError.make({
      message:
        'Must specify at least one of --client-id, --client-secret, or --custom-redirect-uri.',
    });
  }

  let promptCredentials = false;
  let promptRedirect = false;

  if (!hasAnyUpdateFlag && !yes) {
    const action = yield* selectUpdateAction([
      { label: 'Rotate credentials', value: 'rotate' },
      { label: 'Update redirect URI', value: 'redirect' },
    ]);
    promptCredentials = action === 'rotate';
    promptRedirect = action === 'redirect';
  }

  const clientId = yield* optOrPromptIf(params.opts, 'client-id', {
    promptIf: promptCredentials,
    required: promptCredentials,
    prompt: clientIdPrompt({ providerUrl: params.providerUrl }),
  });
  const clientSecret = yield* optOrPromptIf(params.opts, 'client-secret', {
    promptIf: promptCredentials,
    required: promptCredentials,
    prompt: clientSecretPrompt({ providerUrl: params.providerUrl }),
  });
  const customRedirectUri = yield* optOrPromptIf(
    params.opts,
    'custom-redirect-uri',
    {
      promptIf: promptRedirect,
      required: promptRedirect,
      prompt: promptRedirect ? newRedirectPrompt : redirectPrompt,
    },
  );

  const response = yield* updateOAuthClient({
    oauthClientId: params.client.id,
    clientId,
    clientSecret,
    redirectTo: customRedirectUri,
  });

  const lines = [
    `${params.providerLabel} OAuth client updated: ${response.client.client_name}`,
    `ID: ${response.client.id}`,
  ];

  if (customRedirectUri) {
    lines.push(
      ...redirectSetupMessages({
        prompt: params.redirectSetupPrompt,
        redirectUri: customRedirectUri,
        showCustomRedirectInstructions: true,
      }),
    );
  }

  yield* Effect.log(
    boxen(lines.join('\n'), {
      dimBorder: true,
      padding: { right: 1, left: 1 },
    }),
  );
});

const appleWebFlags = [
  'team-id',
  'key-id',
  'private-key-file',
  'custom-redirect-uri',
];
const appleUpdateFlags = ['services-id', ...appleWebFlags];

const hasAppleWebFlags = (opts: Record<string, unknown>) =>
  hasAnyFlag(opts, appleWebFlags);

const hasAppleUpdateFlags = (opts: Record<string, unknown>) =>
  hasAnyFlag(opts, appleUpdateFlags);

const appleClientHasWebConfig = (client: OAuthClientRow) =>
  Boolean(
    getMetaString(client.meta, 'teamId') ||
      getMetaString(client.meta, 'keyId') ||
      client.redirect_to,
  );

type AppleWebUpdate = {
  privateKey?: string;
  redirectTo?: string;
  customRedirectUri?: string;
  meta?: Record<string, string>;
};

const resolveAppleUpdateConfig = Effect.fn(function* ({
  opts,
  client,
  yes,
}: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
  yes: boolean;
}) {
  const hasAnyUpdateFlag = hasAppleUpdateFlags(opts);

  if (yes && !hasAnyUpdateFlag) {
    return yield* BadArgsError.make({
      message:
        'Must specify at least one of --services-id, --team-id, --key-id, --private-key-file, or --custom-redirect-uri.',
    });
  }

  const promptAll = !hasAnyUpdateFlag && !yes;
  if (!promptAll) {
    return { promptAll, configureWeb: hasAppleWebFlags(opts) };
  }

  const configureWeb = yield* runUIEffect(
    new UI.Confirmation({
      promptText:
        'Configure web redirect flow? ' +
        chalk.dim(
          '(requires Team ID, Key ID, and a .p8 private key from Apple)',
        ),
      defaultValue: appleClientHasWebConfig(client),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );

  return { promptAll, configureWeb };
});

const readAppleWebUpdate = Effect.fn(function* ({
  opts,
  client,
  promptAll,
}: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
  promptAll: boolean;
}) {
  const teamId = yield* optOrPromptIf(opts, 'team-id', {
    promptIf: promptAll,
    required: promptAll,
    prompt: appleTeamIdPrompt({}),
  });
  const keyId = yield* optOrPromptIf(opts, 'key-id', {
    promptIf: promptAll,
    required: promptAll,
    prompt: appleKeyIdPrompt({}),
  });
  const privateKeyPath = yield* optOrPromptIf(opts, 'private-key-file', {
    promptIf: promptAll,
    required: promptAll,
    prompt: applePrivateKeyFilePrompt({}),
  });
  const privateKey = privateKeyPath
    ? yield* readPrivateKeyFile(privateKeyPath)
    : undefined;
  const customRedirectUri = yield* optOrPromptIf(opts, 'custom-redirect-uri', {
    promptIf: promptAll,
    required: false,
    prompt: redirectPrompt,
  });

  const meta: Record<string, string> = {};
  if (teamId) meta.teamId = teamId;
  if (keyId) meta.keyId = keyId;

  return {
    privateKey,
    redirectTo: privateKey
      ? customRedirectUri || client.redirect_to || DEFAULT_OAUTH_CALLBACK_URL
      : customRedirectUri,
    customRedirectUri,
    meta: Object.keys(meta).length ? meta : undefined,
  } satisfies AppleWebUpdate;
});

const handleAppleUpdate = Effect.fn(function* (
  opts: Record<string, unknown>,
  client: OAuthClientRow,
) {
  const { yes } = yield* GlobalOpts;
  const { promptAll, configureWeb } = yield* resolveAppleUpdateConfig({
    opts,
    client,
    yes,
  });

  const servicesId = yield* optOrPromptIf(opts, 'services-id', {
    promptIf: promptAll,
    required: promptAll,
    prompt: appleServicesIdPrompt({}),
  });
  const webUpdate: AppleWebUpdate = configureWeb
    ? yield* readAppleWebUpdate({ opts, client, promptAll })
    : {};

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    clientId: servicesId,
    clientSecret: webUpdate.privateKey,
    redirectTo: webUpdate.redirectTo,
    meta: webUpdate.meta,
  });

  const lines = [
    `Apple OAuth client updated: ${response.client.client_name}`,
    `ID: ${response.client.id}`,
  ];

  if (webUpdate.redirectTo) {
    lines.push(
      ...redirectSetupMessages({
        prompt: `Add this return URL under your Services ID on ${link('https://developer.apple.com', 'developer.apple.com')}`,
        redirectUri: webUpdate.redirectTo,
        showCustomRedirectInstructions: Boolean(webUpdate.customRedirectUri),
      }),
    );
  }

  yield* Effect.log(
    boxen(lines.join('\n'), {
      dimBorder: true,
      padding: { right: 1, left: 1 },
    }),
  );
});

const handleClerkUpdate = Effect.fn(function* (
  opts: Record<string, unknown>,
  client: OAuthClientRow,
) {
  const { yes } = yield* GlobalOpts;
  const publishableKey = yield* optOrPromptIf(opts, 'publishable-key', {
    promptIf: !yes && !hasFlag(opts, 'publishable-key'),
    required: true,
    prompt: clerkPublishableKeyPrompt({}),
  });

  if (!publishableKey) {
    return yield* BadArgsError.make({
      message: 'Missing required value for --publishable-key',
    });
  }

  const domain = domainFromClerkKey(publishableKey);
  if (!domain) {
    return yield* BadArgsError.make({
      message: 'Invalid publishable key. Could not extract domain.',
    });
  }

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    discoveryEndpoint: `https://${domain}/.well-known/openid-configuration`,
    meta: { clerkPublishableKey: publishableKey },
  });

  yield* Effect.log(
    boxen(
      [
        `Clerk OAuth client updated: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `Clerk Domain: https://${domain}`,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

const handleFirebaseUpdate = Effect.fn(function* (
  opts: Record<string, unknown>,
  client: OAuthClientRow,
) {
  const { yes } = yield* GlobalOpts;
  const projectId = yield* optOrPromptIf(opts, 'project-id', {
    promptIf: !yes && !hasFlag(opts, 'project-id'),
    required: true,
    prompt: firebaseProjectIdPrompt({}),
  });

  const validationError = validateFirebaseProjectId(projectId ?? '');
  if (validationError) {
    return yield* BadArgsError.make({ message: validationError });
  }

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    discoveryEndpoint: firebaseDiscoveryEndpoint(projectId!),
  });

  yield* Effect.log(
    boxen(
      [
        `Firebase OAuth client updated: ${response.client.client_name}`,
        `ID: ${response.client.id}`,
        `Firebase Project ID: ${projectId}`,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

export const authClientUpdateCmd = Effect.fn(
  function* (
    opts: OptsFromCommand<typeof authClientUpdateDef> & Record<string, unknown>,
  ) {
    const { yes } = yield* GlobalOpts;
    const id = yield* getOptionalStringFlag(getFlag(opts, 'id'), '--id');
    const name = yield* getOptionalStringFlag(getFlag(opts, 'name'), '--name');
    const { auth, client: resolvedClient } = yield* resolveClient({
      id,
      name,
      yes,
    });
    const provider = (auth.oauth_service_providers ?? []).find(
      (entry: ProviderRow) => entry.id === resolvedClient.provider_id,
    );

    if (!provider) {
      return yield* BadArgsError.make({
        message: `OAuth provider not found for client: ${resolvedClient.client_name}`,
      });
    }

    yield* Match.value(provider.provider_name).pipe(
      Match.withReturnType<Effect.Effect<void, any, any>>(),
      Match.when('google', () => handleGoogleUpdate(opts, resolvedClient)),
      Match.when('github', () =>
        handleClientIdSecretUpdate({
          opts,
          client: resolvedClient,
          providerLabel: 'GitHub',
          providerUrl: 'https://github.com/settings/developers',
          redirectSetupPrompt:
            'Add this callback URL in your GitHub OAuth App settings',
        }),
      ),
      Match.when('linkedin', () =>
        handleClientIdSecretUpdate({
          opts,
          client: resolvedClient,
          providerLabel: 'LinkedIn',
          providerUrl: 'https://www.linkedin.com/developers/apps',
          redirectSetupPrompt:
            'Add this redirect URI in your LinkedIn app settings',
        }),
      ),
      Match.when('apple', () => handleAppleUpdate(opts, resolvedClient)),
      Match.when('clerk', () => handleClerkUpdate(opts, resolvedClient)),
      Match.when('firebase', () => handleFirebaseUpdate(opts, resolvedClient)),
      Match.orElse((providerName) =>
        BadArgsError.make({
          message: `Updating ${providerName} OAuth clients is not supported.`,
        }),
      ),
    );
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli auth client update --help` for available arguments',
        ),
      );
    }),
  ),
);
