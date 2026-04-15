import { Effect, Match, Option, Schema } from 'effect';
import type { authClientAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { promptOk, runUIEffect } from '../../../lib/ui.ts';
import {
  addOAuthClient,
  addOAuthProvider,
  getAppsAuth,
  promptForRedirectURI,
} from '../../../lib/oauth.ts';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_DEFAULT_CALLBACK_URL,
  GOOGLE_DISCOVERY_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from '@instantdb/platform';
import {
  getBooleanFlag,
  getOptionalStringFlag,
  invalidFlagError,
  optOrPrompt,
} from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';
import chalk from 'chalk';

const ClientTypeSchema = Schema.Literal(
  'google',
  // 'apple',
  // 'github',
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

const isNativeAppType = (
  appType: typeof GoogleAppTypeSchema.Type,
): appType is 'ios' | 'android' => appType === 'ios' || appType === 'android';

const selectGoogleAppType = (value: unknown) =>
  Effect.gen(function* () {
    const { yes } = yield* GlobalOpts;

    return yield* Option.fromNullable(value).pipe(
      Effect.catchTag('NoSuchElementException', () => {
        if (yes) {
          return BadArgsError.make({
            message: `Missing required value for: App type. Expected one of: ${GoogleAppTypeSchema.literals.join(', ')}`,
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
            'Invalid app type, must be one of: web, ios, android, button-for-web',
        }),
      ),
    );
  });

const promptSkipNonceChecks = (value: unknown) =>
  Effect.gen(function* () {
    const parsed = yield* getBooleanFlag(value, 'skipNonceChecks');
    if (parsed !== undefined) return parsed;

    const { yes } = yield* GlobalOpts;
    if (yes) return true;

    return yield* promptOk(
      {
        promptText: 'Skip nonce checks?',
        yesText: 'Skip',
        noText: 'Keep',
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      },
      true,
    );
  });

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

const getOrCreateGoogleProvider = Effect.fn(function* () {
  const auth = yield* getAppsAuth();
  const provider = auth.oauth_service_providers?.find(
    (entry) => entry.provider_name === 'google',
  );

  if (provider) {
    return { auth, provider };
  }

  const created = yield* addOAuthProvider({ providerName: 'google' });
  return { auth, provider: created.provider };
});

const handleGoogleClient = Effect.fn(function* (opts: Record<string, unknown>) {
  const appType = yield* selectGoogleAppType(opts.appType);
  const { auth, provider } = yield* getOrCreateGoogleProvider();
  const usedClientNames = new Set(
    (auth.oauth_clients ?? []).map((client) => client.client_name),
  );
  const suggestedClientName = findName(`google-${appType}`, usedClientNames);

  const clientName = yield* optOrPrompt(opts.name, {
    prompt: 'Client Name: ',
    placeholder: suggestedClientName,
    defaultValue: suggestedClientName,
  });

  if (usedClientNames.has(clientName)) {
    return yield* BadArgsError.make({
      message: `The unique name '${clientName}' is already in use.`,
    });
  }

  const clientId = yield* optOrPrompt(opts.clientId, {
    prompt: 'Client ID: ',
  });

  const clientSecret = yield* getOptionalStringFlag(
    opts.clientSecret,
    'clientSecret',
  );
  const customRedirectUri = yield* getOptionalStringFlag(
    opts.customRedirectUri,
    'customRedirectUri',
  );
  const skipNonceChecksFlag = yield* getBooleanFlag(
    opts.skipNonceChecks,
    'skipNonceChecks',
  );

  if (appType !== 'web' && clientSecret !== undefined) {
    return yield* invalidFlagError(
      'clientSecret',
      'only supported for app type web',
    );
  }

  if (appType !== 'web' && customRedirectUri !== undefined) {
    return yield* invalidFlagError(
      'customRedirectUri',
      'only supported for app type web',
    );
  }

  if (!isNativeAppType(appType) && skipNonceChecksFlag !== undefined) {
    return yield* invalidFlagError(
      'skipNonceChecks',
      'only supported for app types ios and android',
    );
  }

  const resolvedClientSecret =
    appType === 'web'
      ? yield* optOrPrompt(clientSecret, {
          prompt: 'Client Secret: ',
          sensitive: true,
        })
      : undefined;
  const redirectTo =
    appType === 'web'
      ? yield* promptForRedirectURI(customRedirectUri)
      : undefined;
  const skipNonceChecks = isNativeAppType(appType)
    ? yield* promptSkipNonceChecks(skipNonceChecksFlag)
    : false;

  const response = yield* addOAuthClient({
    providerId: provider.id,
    clientName,
    clientId,
    clientSecret: resolvedClientSecret,
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    discoveryEndpoint: GOOGLE_DISCOVERY_ENDPOINT,
    redirectTo,
    meta: {
      appType,
      skipNonceChecks,
    },
  });

  const redirectUri = redirectTo ?? GOOGLE_DEFAULT_CALLBACK_URL;

  yield* Effect.log();
  yield* Effect.log(
    `Google OAuth client created: ${response.client.client_name}`,
  );
  yield* Effect.log(`App type: ${appType}`);
  yield* Effect.log(`Client database id: ${response.client.id}`);
  yield* Effect.log(
    `Google client id: ${response.client.client_id ?? clientId}`,
  );
  yield* Effect.log(`Add this redirect URI in Google Console: ${redirectUri}`);

  if (redirectTo) {
    yield* Effect.log(
      `Your custom redirect must forward to ${GOOGLE_DEFAULT_CALLBACK_URL} with all query parameters preserved.`,
    );
  }
});

export const authClientAddCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authClientAddDef> & Record<string, unknown>,
) {
  const { yes } = yield* GlobalOpts;
  if (!opts.appType && yes) {
    return yield* BadArgsError.make({
      message: `Missing required value for: App type. Expected one of: ${ClientTypeSchema.literals.join(', ')}`,
    });
  }
  const clientType = yield* Option.fromNullable(opts.type).pipe(
    Effect.catchTag('NoSuchElementException', () =>
      runUIEffect(
        new UI.Select({
          options: [
            { label: 'Google', value: 'google' },
            // TODO: implement
            // { label: 'Apple', value: 'apple' },
            // { label: 'GitHub', value: 'github' },
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
    // Match.when('apple', () => Effect.logError('Not Implemented')),
    // Match.when('clerk', () => Effect.logError('Not Implemented')),
    // Match.when('github', () => Effect.logError('Not Implemented')),
    // Match.when('firebase', () => Effect.logError('Not Implemented')),
    // Match.when('linkedin', () => Effect.logError('Not Implemented')),
    Match.exhaustive,
  );
});
