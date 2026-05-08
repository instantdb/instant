import { Effect, Match } from 'effect';
import type { authClientUpdateDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { Args } from '../../../lib/args.ts';
import { runUIEffect } from '../../../lib/ui.ts';
import {
  findClientByIdOrName,
  getAppsAuth,
  OAuthClient,
  updateOAuthClient,
} from '../../../lib/oauth.ts';
import { UI } from '../../../ui/index.ts';
import {
  clerkDomainFromPublishableKey,
  DEFAULT_OAUTH_CALLBACK_URL,
} from '@instantdb/platform';
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
  firebaseDiscoveryEndpoint,
  firebaseProjectIdPrompt,
  getMetaString,
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
}) {
  const { yes } = yield* GlobalOpts;

  if (params.id || params.name) {
    return yield* findClientByIdOrName({
      id: params.id,
      name: params.name,
    });
  }

  if (yes) {
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
      modifyOutput: UI.modifiers.dimOnComplete,
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
    Effect.map((client) => ({ auth, client })),
  );
});

const selectUpdateAction = Effect.fn(function* <T extends string>(
  options: { label: string; value: T; secondary?: boolean }[],
) {
  return yield* runUIEffect(
    new UI.Select({
      options,
      promptText: 'What do you want to update?',
      modifyOutput: UI.modifiers.dimOnComplete,
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

type GoogleUpdateMode = 'dev' | 'custom' | 'redirect' | 'none';

const hasGoogleCustomCredentialFlags = (opts: Record<string, unknown>) =>
  Args.hasAny(opts, ['client-id', 'client-secret', 'custom-redirect-uri']);

const hasGoogleUpdateFlags = (opts: Record<string, unknown>) =>
  Args.isTrue(opts, 'dev-credentials') || hasGoogleCustomCredentialFlags(opts);

const selectGoogleUpdateMode = Effect.fn(function* ({
  isWeb,
  switchingFromShared,
}: {
  isWeb: boolean;
  switchingFromShared: boolean;
}) {
  if (switchingFromShared) {
    return yield* runUIEffect(
      new UI.Select({
        options: [
          { label: 'Custom Google credentials', value: 'custom' },
          {
            label: 'Instant dev credentials' + chalk.dim(' (current)'),
            value: 'none',
          },
        ],
        promptText: 'Choose credential mode:',
        modifyOutput: UI.modifiers.dimOnComplete,
      }),
    ).pipe(
      Effect.catchTag('UIError', (e) =>
        BadArgsError.make({ message: `UI error: ${e.message}` }),
      ),
    );
  }

  const options: { label: string; value: GoogleUpdateMode }[] = [
    { label: 'Update Client ID and Client Secret', value: 'custom' },
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
}: {
  opts: Record<string, unknown>;
  isWeb: boolean;
  switchingFromShared: boolean;
}) {
  const { yes } = yield* GlobalOpts;
  const devCredentialsFlag = Args.isTrue(opts, 'dev-credentials');
  const hasProvidedSomeCustomCredentials = hasGoogleCustomCredentialFlags(opts);

  if (devCredentialsFlag && !isWeb) {
    return yield* BadArgsError.make({
      message: '--dev-credentials is only supported for Google web clients.',
    });
  }

  if (
    !isWeb &&
    (Args.has(opts, 'client-secret') || Args.has(opts, 'custom-redirect-uri'))
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

  if (
    yes &&
    isWeb &&
    switchingFromShared &&
    (!Args.has(opts, 'client-id') || !Args.has(opts, 'client-secret'))
  ) {
    return yield* BadArgsError.make({
      message:
        'Must specify both --client-id and --client-secret when switching from Instant dev credentials to custom credentials with --yes.',
    });
  }

  if (hasAnyUpdateFlag) {
    return 'custom';
  }

  return yield* selectGoogleUpdateMode({ isWeb, switchingFromShared });
});

const updateGoogleRedirect = Effect.fn(function* ({
  opts,
  client,
}: {
  opts: Record<string, unknown>;
  client: OAuthClientRow;
}) {
  const redirectTo = yield* Args.text(opts, 'custom-redirect-uri').pipe(
    Args.prompt(newRedirectPrompt),
    Args.required(),
  );

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
  const shouldPromptRedirectUri =
    isWeb && switchingFromShared && promptCredentials;

  const clientId = yield* Args.text(opts, 'client-id').pipe(
    Args.availableWhen(mustCollectCredentials || Args.has(opts, 'client-id')),
    Args.prompt(clientIdPrompt({ providerUrl: googleConsoleUrl })),
    Args.required(),
  );
  const clientSecret = yield* Args.text(opts, 'client-secret').pipe(
    Args.availableWhen(
      isWeb && (mustCollectCredentials || Args.has(opts, 'client-secret')),
    ),
    Args.prompt(clientSecretPrompt({ providerUrl: googleConsoleUrl })),
    Args.required(),
  );
  const customRedirectUri = isWeb
    ? yield* Args.text(opts, 'custom-redirect-uri').pipe(
        Args.availableWhen(
          shouldPromptRedirectUri || Args.has(opts, 'custom-redirect-uri'),
        ),
        Args.prompt(redirectPrompt),
        Args.optional(),
      )
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
  });

  if (updateMode === 'dev') {
    return yield* updateGoogleToDevCredentials(client);
  }

  if (updateMode === 'none') {
    yield* Effect.log(chalk.dim('No changes made.'));
    return;
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
  const hasAnyUpdateFlag = Args.hasAny(params.opts, [
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
      { label: 'Update Client ID and Client Secret', value: 'rotate' },
      { label: 'Update redirect URI', value: 'redirect' },
    ]);
    promptCredentials = action === 'rotate';
    promptRedirect = action === 'redirect';
  }

  const clientId = yield* Args.text(params.opts, 'client-id').pipe(
    Args.availableWhen(promptCredentials || Args.has(params.opts, 'client-id')),
    Args.prompt(clientIdPrompt({ providerUrl: params.providerUrl })),
    Args.required(),
  );
  const clientSecret = yield* Args.text(params.opts, 'client-secret').pipe(
    Args.availableWhen(
      promptCredentials || Args.has(params.opts, 'client-secret'),
    ),
    Args.prompt(clientSecretPrompt({ providerUrl: params.providerUrl })),
    Args.required(),
  );
  const customRedirectUri = yield* Args.text(
    params.opts,
    'custom-redirect-uri',
  ).pipe(
    Args.availableWhen(
      promptRedirect || Args.has(params.opts, 'custom-redirect-uri'),
    ),
    Args.prompt(promptRedirect ? newRedirectPrompt : redirectPrompt),
    Args.required(),
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
  Args.hasAny(opts, appleWebFlags);

const hasAppleUpdateFlags = (opts: Record<string, unknown>) =>
  Args.hasAny(opts, appleUpdateFlags);

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
  const teamId = yield* Args.text(opts, 'team-id').pipe(
    Args.availableWhen(promptAll || Args.has(opts, 'team-id')),
    Args.prompt(appleTeamIdPrompt({})),
    Args.required(),
  );
  const keyId = yield* Args.text(opts, 'key-id').pipe(
    Args.availableWhen(promptAll || Args.has(opts, 'key-id')),
    Args.prompt(appleKeyIdPrompt({})),
    Args.required(),
  );
  const privateKeyPath = yield* Args.text(opts, 'private-key-file').pipe(
    Args.availableWhen(promptAll || Args.has(opts, 'private-key-file')),
    Args.prompt(applePrivateKeyFilePrompt({})),
    Args.required(),
  );
  const privateKey = privateKeyPath
    ? yield* readPrivateKeyFile(privateKeyPath)
    : undefined;
  const customRedirectUri = yield* Args.text(opts, 'custom-redirect-uri').pipe(
    Args.availableWhen(promptAll || Args.has(opts, 'custom-redirect-uri')),
    Args.prompt(redirectPrompt),
    Args.optional(),
  );

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

  const servicesId = yield* Args.text(opts, 'services-id').pipe(
    Args.availableWhen(promptAll || Args.has(opts, 'services-id')),
    Args.prompt(appleServicesIdPrompt({})),
    Args.required(),
  );
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
  const publishableKey = yield* Args.text(opts, 'publishable-key').pipe(
    Args.prompt(clerkPublishableKeyPrompt({})),
    Args.required(),
  );

  const domain = clerkDomainFromPublishableKey(publishableKey);
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
  const projectId = yield* Args.text(opts, 'project-id').pipe(
    Args.prompt(firebaseProjectIdPrompt({})),
    Args.validate(validateFirebaseProjectId),
    Args.required(),
  );

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    discoveryEndpoint: firebaseDiscoveryEndpoint(projectId),
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
    const { auth, client: resolvedClient } = yield* resolveClient({
      id: opts.id,
      name: opts.name,
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
