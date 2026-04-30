import { Effect, Match } from 'effect';
import boxen from 'boxen';
import chalk from 'chalk';
import { FileSystem } from '@effect/platform';
import type { authClientUpdateDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import {
  findClientByIdOrName,
  getAppsAuth,
  updateOAuthClient,
  type OAuthClientType,
} from '../../../lib/oauth.ts';
import {
  optOrPrompt,
  runUIEffect,
  stripFirstBlankLine,
  validateRequired,
} from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';
import { DEFAULT_OAUTH_CALLBACK_URL } from '@instantdb/platform';
import { link } from '../../../logging.ts';

const isFlagSet = (opts: Record<string, unknown>, ...keys: string[]) =>
  keys.some((k) => opts[k] !== undefined && opts[k] !== null && opts[k] !== '');

const readPrivateKeyFile = Effect.fn('readPrivateKeyFile')(function* (
  path: string,
) {
  const fs = yield* FileSystem.FileSystem;
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

const promptCustomRedirectUri = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
  return yield* optOrPrompt(opts['custom-redirect-uri'], {
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
              `\nNew redirect URI:\n${chalk.dim(`Must forward to ${DEFAULT_OAUTH_CALLBACK_URL} with all query parameters preserved.`)}\n\n` +
              stripFirstBlankLine(output)
            );
          }
          return `\nNew redirect URI:\n${stripFirstBlankLine(output)}`;
        },
        UI.modifiers.dimOnComplete,
      ]),
    },
  });
});

const logSummary = Effect.fn(function* (
  client: OAuthClientType,
  providerName: string,
  extraLines: string[] = [],
) {
  yield* Effect.log(
    boxen(
      [
        `${providerName} OAuth client updated: ${client.client_name}`,
        `ID: ${client.id}`,
        ...extraLines,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

// ---------- Google ----------

const handleGoogleUpdate = Effect.fn(function* (
  client: OAuthClientType,
  opts: Record<string, unknown>,
) {
  const { yes } = yield* GlobalOpts;
  const isShared = !!client.use_shared_credentials;

  const sharedFlag = isFlagSet(
    opts,
    'use-shared-credentials',
    'useSharedCredentials',
  );
  const credFlags = isFlagSet(
    opts,
    'client-id',
    'clientId',
    'client-secret',
    'clientSecret',
  );
  const redirectFlag = isFlagSet(
    opts,
    'custom-redirect-uri',
    'customRedirectUri',
  );

  if (sharedFlag && (credFlags || redirectFlag)) {
    return yield* BadArgsError.make({
      message:
        '--use-shared-credentials is mutually exclusive with --client-id, --client-secret, and --custom-redirect-uri.',
    });
  }

  // Determine intent
  type Intent =
    | {
        kind: 'set-custom';
        clientId: string;
        clientSecret: string;
        redirect?: string;
      }
    | { kind: 'switch-to-shared' }
    | { kind: 'rotate'; clientId: string; clientSecret: string }
    | { kind: 'update-redirect'; redirect: string };

  let intent: Intent | undefined;

  if (sharedFlag) {
    intent = { kind: 'switch-to-shared' };
  } else if (credFlags) {
    const clientId = yield* optOrPrompt(opts['client-id'], {
      simpleName: '--client-id',
      required: true,
      skipIf: false,
      prompt: {
        prompt: `Client ID: ${chalk.dim(`(from ${link('https://console.developers.google.com/apis/credentials')})`)}`,
        validate: validateRequired,
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      },
    });
    const clientSecret = yield* optOrPrompt(opts['client-secret'], {
      simpleName: '--client-secret',
      required: true,
      skipIf: false,
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
    if (!clientId || !clientSecret) {
      return yield* BadArgsError.make({
        message: 'Missing client credentials.',
      });
    }
    const redirect = redirectFlag
      ? (((yield* promptCustomRedirectUri(opts)) || undefined) as
          | string
          | undefined)
      : undefined;
    intent = isShared
      ? { kind: 'set-custom', clientId, clientSecret, redirect }
      : { kind: 'rotate', clientId, clientSecret };
  } else if (redirectFlag) {
    const redirect = yield* promptCustomRedirectUri(opts);
    if (!redirect) {
      return yield* BadArgsError.make({
        message: '--custom-redirect-uri must be a non-empty URL.',
      });
    }
    intent = { kind: 'update-redirect', redirect };
  } else {
    if (yes) {
      return yield* BadArgsError.make({
        message:
          'Nothing to update. Pass at least one of --client-id, --client-secret, --use-shared-credentials, or --custom-redirect-uri.',
      });
    }
    yield* Effect.log(
      `\nCurrent mode: ${isShared ? chalk.bold('shared dev credentials') : 'custom'}`,
    );
    if (isShared) {
      const clientId = yield* optOrPrompt(undefined, {
        simpleName: '--client-id',
        required: true,
        skipIf: false,
        prompt: {
          prompt: `Client ID: ${chalk.dim(`(from ${link('https://console.developers.google.com/apis/credentials')})`)}`,
          validate: validateRequired,
          modifyOutput: UI.modifiers.piped([
            UI.modifiers.topPadding,
            UI.modifiers.dimOnComplete,
          ]),
        },
      });
      const clientSecret = yield* optOrPrompt(undefined, {
        simpleName: '--client-secret',
        required: true,
        skipIf: false,
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
      if (!clientId || !clientSecret) {
        return yield* BadArgsError.make({
          message: 'Missing client credentials.',
        });
      }
      intent = { kind: 'set-custom', clientId, clientSecret };
    } else {
      const action = yield* runUIEffect(
        new UI.Select({
          options: [
            { label: 'Rotate credentials', value: 'rotate' },
            {
              label: "Switch to Instant's shared dev credentials",
              value: 'switch-to-shared',
            },
            { label: 'Update redirect URI', value: 'update-redirect' },
          ],
          promptText: 'What do you want to update?',
          modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
        }),
      ).pipe(
        Effect.catchTag('UIError', (e) =>
          BadArgsError.make({ message: `UI error: ${e.message}` }),
        ),
      );
      if (action === 'rotate') {
        const clientId = yield* optOrPrompt(undefined, {
          simpleName: '--client-id',
          required: true,
          skipIf: false,
          prompt: {
            prompt: 'Client ID:',
            validate: validateRequired,
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.dimOnComplete,
            ]),
          },
        });
        const clientSecret = yield* optOrPrompt(undefined, {
          simpleName: '--client-secret',
          required: true,
          skipIf: false,
          prompt: {
            prompt: 'Client Secret:',
            validate: validateRequired,
            sensitive: true,
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.dimOnComplete,
            ]),
          },
        });
        if (!clientId || !clientSecret) {
          return yield* BadArgsError.make({
            message: 'Missing client credentials.',
          });
        }
        intent = { kind: 'rotate', clientId, clientSecret };
      } else if (action === 'switch-to-shared') {
        intent = { kind: 'switch-to-shared' };
      } else {
        const redirect = yield* promptCustomRedirectUri(opts);
        if (!redirect) {
          return yield* BadArgsError.make({
            message: 'Redirect URI cannot be empty.',
          });
        }
        intent = { kind: 'update-redirect', redirect };
      }
    }
  }

  if (!intent) {
    return yield* BadArgsError.make({ message: 'Nothing to update.' });
  }

  const body: Parameters<typeof updateOAuthClient>[0]['body'] = {};
  const summaryLines: string[] = [];

  switch (intent.kind) {
    case 'set-custom':
      body.client_id = intent.clientId;
      body.client_secret = intent.clientSecret;
      body.use_shared_credentials = false;
      if (intent.redirect) body.redirect_to = intent.redirect;
      summaryLines.push('Mode: custom credentials');
      summaryLines.push(`Google Client ID: ${intent.clientId}`);
      summaryLines.push(
        chalk.bold(
          `\nAdd this redirect URI in Google Console:\n${intent.redirect ?? DEFAULT_OAUTH_CALLBACK_URL}`,
        ),
      );
      break;
    case 'rotate':
      body.client_id = intent.clientId;
      body.client_secret = intent.clientSecret;
      summaryLines.push(`Google Client ID: ${intent.clientId}`);
      break;
    case 'switch-to-shared':
      body.use_shared_credentials = true;
      summaryLines.push('Mode: shared dev credentials');
      summaryLines.push(
        'Redirect origins enabled: http://localhost, https://localhost, exp://',
      );
      break;
    case 'update-redirect':
      body.redirect_to = intent.redirect;
      summaryLines.push(`Redirect URI: ${intent.redirect}`);
      break;
  }

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    body,
  });
  yield* logSummary(response.client, 'Google', summaryLines);
});

// ---------- GitHub ----------

const handleGenericCredentialUpdate = Effect.fn(function* (
  client: OAuthClientType,
  opts: Record<string, unknown>,
  providerLabel: string,
  consoleLink: string,
) {
  const { yes } = yield* GlobalOpts;

  const credFlags = isFlagSet(
    opts,
    'client-id',
    'clientId',
    'client-secret',
    'clientSecret',
  );
  const redirectFlag = isFlagSet(
    opts,
    'custom-redirect-uri',
    'customRedirectUri',
  );

  if (!credFlags && !redirectFlag && yes) {
    return yield* BadArgsError.make({
      message:
        'Nothing to update. Pass --client-id, --client-secret, or --custom-redirect-uri.',
    });
  }

  const body: Parameters<typeof updateOAuthClient>[0]['body'] = {};
  const summaryLines: string[] = [];

  if (credFlags) {
    const clientId = yield* optOrPrompt(opts['client-id'], {
      simpleName: '--client-id',
      required: true,
      skipIf: false,
      prompt: {
        prompt: `Client ID: ${chalk.dim(`(from ${link(consoleLink)})`)}`,
        validate: validateRequired,
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      },
    });
    const clientSecret = yield* optOrPrompt(opts['client-secret'], {
      simpleName: '--client-secret',
      required: true,
      skipIf: false,
      prompt: {
        prompt: `Client Secret: ${chalk.dim(`(from ${link(consoleLink)})`)}`,
        validate: validateRequired,
        sensitive: true,
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      },
    });
    if (!clientId || !clientSecret) {
      return yield* BadArgsError.make({
        message: 'Missing client credentials.',
      });
    }
    body.client_id = clientId;
    body.client_secret = clientSecret;
    summaryLines.push(`${providerLabel} Client ID: ${clientId}`);
  }

  if (redirectFlag) {
    const redirect = yield* promptCustomRedirectUri(opts);
    if (redirect) {
      body.redirect_to = redirect;
      summaryLines.push(`Redirect URI: ${redirect}`);
    }
  }

  if (!credFlags && !redirectFlag) {
    // Interactive without flags
    const action = yield* runUIEffect(
      new UI.Select({
        options: [
          { label: 'Rotate credentials', value: 'rotate' },
          { label: 'Update redirect URI', value: 'redirect' },
        ],
        promptText: 'What do you want to update?',
        modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
      }),
    ).pipe(
      Effect.catchTag('UIError', (e) =>
        BadArgsError.make({ message: `UI error: ${e.message}` }),
      ),
    );
    if (action === 'rotate') {
      const clientId = yield* optOrPrompt(undefined, {
        simpleName: '--client-id',
        required: true,
        skipIf: false,
        prompt: {
          prompt: `Client ID: ${chalk.dim(`(from ${link(consoleLink)})`)}`,
          validate: validateRequired,
          modifyOutput: UI.modifiers.piped([
            UI.modifiers.topPadding,
            UI.modifiers.dimOnComplete,
          ]),
        },
      });
      const clientSecret = yield* optOrPrompt(undefined, {
        simpleName: '--client-secret',
        required: true,
        skipIf: false,
        prompt: {
          prompt: `Client Secret: ${chalk.dim(`(from ${link(consoleLink)})`)}`,
          validate: validateRequired,
          sensitive: true,
          modifyOutput: UI.modifiers.piped([
            UI.modifiers.topPadding,
            UI.modifiers.dimOnComplete,
          ]),
        },
      });
      if (!clientId || !clientSecret) {
        return yield* BadArgsError.make({
          message: 'Missing client credentials.',
        });
      }
      body.client_id = clientId;
      body.client_secret = clientSecret;
      summaryLines.push(`${providerLabel} Client ID: ${clientId}`);
    } else {
      const redirect = yield* promptCustomRedirectUri(opts);
      if (!redirect) {
        return yield* BadArgsError.make({
          message: 'Redirect URI cannot be empty.',
        });
      }
      body.redirect_to = redirect;
      summaryLines.push(`Redirect URI: ${redirect}`);
    }
  }

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    body,
  });
  yield* logSummary(response.client, providerLabel, summaryLines);
});

// ---------- Apple ----------

const handleAppleUpdate = Effect.fn(function* (
  client: OAuthClientType,
  opts: Record<string, unknown>,
) {
  const { yes } = yield* GlobalOpts;

  const servicesIdFlag = isFlagSet(opts, 'services-id', 'servicesId');
  const privateKeyFlag = isFlagSet(opts, 'private-key-file', 'privateKeyFile');
  const teamIdFlag = isFlagSet(opts, 'team-id', 'teamId');
  const keyIdFlag = isFlagSet(opts, 'key-id', 'keyId');
  const redirectFlag = isFlagSet(
    opts,
    'custom-redirect-uri',
    'customRedirectUri',
  );

  const anyFlag =
    servicesIdFlag || privateKeyFlag || teamIdFlag || keyIdFlag || redirectFlag;

  if (!anyFlag && yes) {
    return yield* BadArgsError.make({
      message:
        'Nothing to update. Pass at least one of --services-id, --private-key-file, --team-id, --key-id, or --custom-redirect-uri.',
    });
  }

  if (!anyFlag) {
    yield* Effect.log(
      'Tip: pass flags directly. Available: --services-id, --private-key-file, --team-id, --key-id, --custom-redirect-uri.',
    );
    return yield* BadArgsError.make({
      message: 'Specify at least one update flag.',
    });
  }

  const body: Parameters<typeof updateOAuthClient>[0]['body'] = {};
  const meta: { teamId?: string; keyId?: string } = {};
  const summaryLines: string[] = [];

  if (servicesIdFlag) {
    const v = String(opts['services-id'] ?? opts['servicesId'] ?? '').trim();
    if (!v) {
      return yield* BadArgsError.make({
        message: '--services-id must be non-empty.',
      });
    }
    body.client_id = v;
    summaryLines.push(`Services ID: ${v}`);
  }
  if (privateKeyFlag) {
    const path = String(
      opts['private-key-file'] ?? opts['privateKeyFile'] ?? '',
    ).trim();
    if (!path) {
      return yield* BadArgsError.make({
        message: '--private-key-file must be non-empty.',
      });
    }
    body.client_secret = yield* readPrivateKeyFile(path);
  }
  if (teamIdFlag) {
    meta.teamId = String(opts['team-id'] ?? opts['teamId']);
    summaryLines.push(`Team ID: ${meta.teamId}`);
  }
  if (keyIdFlag) {
    meta.keyId = String(opts['key-id'] ?? opts['keyId']);
    summaryLines.push(`Key ID: ${meta.keyId}`);
  }
  if (Object.keys(meta).length > 0) {
    body.meta = meta;
  }
  if (redirectFlag) {
    const redirect = yield* promptCustomRedirectUri(opts);
    if (redirect) {
      body.redirect_to = redirect;
      summaryLines.push(`Redirect URI: ${redirect}`);
    }
  }

  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    body,
  });
  yield* logSummary(response.client, 'Apple', summaryLines);
});

// ---------- Clerk ----------

const handleClerkUpdate = Effect.fn(function* (
  client: OAuthClientType,
  opts: Record<string, unknown>,
) {
  const publishableKey = yield* optOrPrompt(opts['publishable-key'], {
    simpleName: '--publishable-key',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `New Clerk publishable key ${chalk.dim(`(from ${link('https://dashboard.clerk.com/last-active?path=api-keys')})`)}`,
      placeholder:
        'pk_********************************************************',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: (val) => {
        if (!val) return 'Publishable key is required';
        if (!val.startsWith('pk_')) {
          return 'Invalid publishable key. It should start with "pk_".';
        }
      },
    },
  });
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
  const discoveryEndpoint = `https://${domain}/.well-known/openid-configuration`;
  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    body: {
      meta: { clerkPublishableKey: publishableKey },
      discovery_endpoint: discoveryEndpoint,
    },
  });
  yield* logSummary(response.client, 'Clerk', [
    `Clerk Publishable Key: ${publishableKey}`,
    `Clerk Domain: ${domain}`,
  ]);
});

// ---------- Firebase ----------

const handleFirebaseUpdate = Effect.fn(function* (
  client: OAuthClientType,
  opts: Record<string, unknown>,
) {
  const firebaseProjectIdRegex = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  const projectId = yield* optOrPrompt(opts['project-id'], {
    simpleName: '--project-id',
    required: true,
    skipIf: false,
    prompt: {
      prompt: `New Firebase project ID: (From Project Settings page on ${link('https://console.firebase.google.com/')})`,
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
      validate: (val) => {
        if (!val) return 'Project ID is required';
        if (!firebaseProjectIdRegex.test(val)) {
          return 'Invalid Firebase project ID.';
        }
      },
    },
  });
  if (!projectId || !firebaseProjectIdRegex.test(projectId)) {
    return yield* BadArgsError.make({
      message: 'Invalid Firebase project ID.',
    });
  }
  const discoveryEndpoint = `https://securetoken.google.com/${encodeURIComponent(projectId)}/.well-known/openid-configuration`;
  const response = yield* updateOAuthClient({
    oauthClientId: client.id,
    body: { discovery_endpoint: discoveryEndpoint },
  });
  yield* logSummary(response.client, 'Firebase', [
    `Firebase Project ID: ${projectId}`,
  ]);
});

// ---------- Entry ----------

export const authClientUpdateCmd = Effect.fn(
  function* (
    opts: OptsFromCommand<typeof authClientUpdateDef> & Record<string, unknown>,
  ) {
    if (opts.id && opts.name) {
      return yield* BadArgsError.make({
        message: 'Cannot specify both --id and --name',
      });
    }

    if (!opts.id && !opts.name) {
      const { yes } = yield* GlobalOpts;
      if (yes) {
        return yield* BadArgsError.make({
          message: 'Must specify --id or --name',
        });
      }
      // Interactive picker
      const { client, providerName } = yield* pickClientInteractively();
      yield* dispatchByProvider(client, providerName, opts);
      return;
    }

    const { client, auth } = yield* findClientByIdOrName({
      id: opts.id,
      name: opts.name,
    });
    const provider = (auth.oauth_service_providers ?? []).find(
      (p) => p.id === client.provider_id,
    );
    if (!provider) {
      return yield* BadArgsError.make({
        message: `Provider not found for client ${client.client_name}`,
      });
    }
    yield* dispatchByProvider(client, provider.provider_name, opts);
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli auth client update --help` for the list of available arguments',
        ),
      );
    }),
  ),
);

const pickClientInteractively = Effect.fn(function* () {
  const auth = yield* getAppsAuth();
  const clients = auth.oauth_clients ?? [];
  if (clients.length === 0) {
    return yield* BadArgsError.make({ message: 'No OAuth clients found.' });
  }
  const providersById = new Map(
    (auth.oauth_service_providers ?? []).map((p) => [p.id, p]),
  );
  const picked = yield* runUIEffect(
    new UI.Select({
      options: clients.map((c) => ({
        label:
          c.client_name +
          chalk.dim(
            ` (${providersById.get(c.provider_id)?.provider_name ?? c.provider_id})`,
          ),
        value: c,
      })),
      promptText: 'Select a client to update:',
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
  );
  const provider = providersById.get(picked.provider_id);
  if (!provider) {
    return yield* BadArgsError.make({
      message: `Provider not found for client ${picked.client_name}`,
    });
  }
  return { client: picked, providerName: provider.provider_name };
});

const dispatchByProvider = Effect.fn(function* (
  client: OAuthClientType,
  providerName: string,
  opts: Record<string, unknown>,
) {
  yield* Match.value(providerName).pipe(
    Match.withReturnType<Effect.Effect<void, any, any>>(),
    Match.when('google', () => handleGoogleUpdate(client, opts)),
    Match.when('github', () =>
      handleGenericCredentialUpdate(
        client,
        opts,
        'GitHub',
        'https://github.com/settings/developers',
      ),
    ),
    Match.when('linkedin', () =>
      handleGenericCredentialUpdate(
        client,
        opts,
        'LinkedIn',
        'https://www.linkedin.com/developers/apps',
      ),
    ),
    Match.when('apple', () => handleAppleUpdate(client, opts)),
    Match.when('clerk', () => handleClerkUpdate(client, opts)),
    Match.when('firebase', () => handleFirebaseUpdate(client, opts)),
    Match.orElse(() =>
      BadArgsError.make({
        message: `Unsupported provider: ${providerName}`,
      }),
    ),
  );
});

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

function base64Decode(s: string) {
  try {
    return Buffer.from(s, 'base64').toString('utf-8');
  } catch (e) {
    return Buffer.from(s, 'base64url').toString('utf-8');
  }
}
