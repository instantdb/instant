import { HttpBody, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from './http.ts';
import chalk from 'chalk';
import {
  optOrPrompt,
  runUIEffect,
  stripFirstBlankLine,
  validateRequired,
} from './ui.ts';
import { UI } from '../ui/index.ts';
import { BadArgsError } from '../errors.ts';
import { link } from '../logging.ts';
import type { ClientTypeSchema } from '../commands/auth/client/add.ts';

export const AuthorizedOriginService = Schema.Literal(
  'generic',
  'vercel',
  'netlify',
  'custom-scheme',
);

export const AuthorizedOrigin = Schema.Struct({
  id: Schema.String,
  service: AuthorizedOriginService,
  params: Schema.Array(Schema.String).pipe(Schema.mutable),
});

export const OAuthServiceProvider = Schema.Struct({
  id: Schema.String,
  provider_name: Schema.String,
});

export const GoogleAppTypeSchema = Schema.Literal(
  'web',
  'ios',
  'android',
  'button-for-web',
);

const NullableString = Schema.Union(Schema.String, Schema.Null).pipe(
  Schema.optional,
);

const NullableBoolean = Schema.Union(Schema.Boolean, Schema.Null).pipe(
  Schema.optional,
);

const OAuthClientMeta = Schema.Struct({
  // Currently the CLI only reads Google app type from meta. Other providers store
  // different meta shapes, so keep the rest open until we have a clean
  // top-level discriminator for a full provider-specific union.
  appType: GoogleAppTypeSchema.pipe(Schema.optional),
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: Schema.Any })),
);

export const OAuthClient = Schema.Struct({
  id: Schema.String,
  client_name: Schema.String,
  client_id: NullableString,
  provider_id: Schema.String,
  authorization_endpoint: NullableString,
  token_endpoint: NullableString,
  discovery_endpoint: NullableString,
  redirect_to: NullableString,
  meta: Schema.Union(OAuthClientMeta, Schema.Null).pipe(Schema.optional),
  use_shared_credentials: NullableBoolean,
});

export const AddOAuthProviderResponse = Schema.Struct({
  provider: OAuthServiceProvider,
});

export const AddOAuthClientResponse = Schema.Struct({
  client: OAuthClient,
});

export const AuthorizedOriginResponse = Schema.Struct({
  origin: AuthorizedOrigin,
});

const NullableArray = <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  Schema.Union(Schema.Array(schema).pipe(Schema.mutable), Schema.Null).pipe(
    Schema.optional,
  );

export const AppsAuthResponse = Schema.Struct({
  authorized_redirect_origins: NullableArray(AuthorizedOrigin),
  oauth_service_providers: NullableArray(OAuthServiceProvider),
  oauth_clients: NullableArray(OAuthClient),
});

export const getAppsAuth = Effect.fn(function* () {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth'));
  const targetAppId = (yield* CurrentApp).appId;

  return yield* http
    .get(`/dash/apps/${targetAppId}/auth`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(AppsAuthResponse)));
});

export const addOAuthProvider = Effect.fn(function* (params: {
  appId?: string;
  providerName: string;
}) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth'));
  const targetAppId = params.appId ?? (yield* CurrentApp).appId;

  return yield* http
    .post(`/dash/apps/${targetAppId}/oauth_service_providers`, {
      body: HttpBody.unsafeJson({
        provider_name: params.providerName,
      }),
    })
    .pipe(
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(AddOAuthProviderResponse),
      ),
    );
});

export const addOAuthClient = Effect.fn(function* (params: {
  appId?: string;
  providerId: string;
  clientName: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  discoveryEndpoint?: string;
  redirectTo?: string;
  meta?: unknown;
  useSharedCredentials?: boolean;
}) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth'));
  const targetAppId = params.appId ?? (yield* CurrentApp).appId;

  return yield* http
    .post(`/dash/apps/${targetAppId}/oauth_clients`, {
      body: HttpBody.unsafeJson({
        provider_id: params.providerId,
        client_name: params.clientName,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        authorization_endpoint: params.authorizationEndpoint,
        token_endpoint: params.tokenEndpoint,
        discovery_endpoint: params.discoveryEndpoint,
        redirect_to: params.redirectTo,
        meta: params.meta,
        use_shared_credentials: params.useSharedCredentials,
      }),
    })
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(AddOAuthClientResponse)),
    );
});

export const updateOAuthClient = Effect.fn(function* (params: {
  appId?: string;
  oauthClientId: string;
  clientId?: string | null;
  clientSecret?: string | null;
  discoveryEndpoint?: string | null;
  redirectTo?: string | null;
  meta?: unknown;
  useSharedCredentials?: boolean | null;
}) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth'));
  const targetAppId = params.appId ?? (yield* CurrentApp).appId;

  return yield* http
    .post(`/dash/apps/${targetAppId}/oauth_clients/${params.oauthClientId}`, {
      body: HttpBody.unsafeJson({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        discovery_endpoint: params.discoveryEndpoint,
        redirect_to: params.redirectTo,
        meta: params.meta,
        use_shared_credentials: params.useSharedCredentials,
      }),
    })
    .pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(AddOAuthClientResponse)),
    );
});

// Due to the long prompt text, we use modifiers to manually create the prompt so we can
// change it after submission.
export const promptForRedirectURI = Effect.fn(function* (
  existingValue?: string,
) {
  if (existingValue) return existingValue;

  const result = yield* runUIEffect(
    new UI.TextInput({
      prompt: '',
      placeholder: 'https://yoursite.com/oauth/callback',
      modifyOutput: UI.modifiers.piped([
        (output, status) => {
          if (status === 'idle') {
            return (
              `\nCustom redirect URL (optional):
${chalk.dim('With a custom redirect URL, users will see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim(`Your URL must forward to ${link('https://api.instantdb.com/runtime/oauth/callback')} with all query parameters preserved.`)}\n\n` +
              stripFirstBlankLine(output)
            );
          }
          return `\nCustom redirect URL (optional):\n${stripFirstBlankLine(output)}`;
        },
        UI.modifiers.dimOnComplete,
      ]),
    }),
  ).pipe(
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({
        message: `UI error for redirect URI: ${e.message}`,
      }),
    ),
  );

  return result === '' ? undefined : result;
});

export const getOrCreateProvider = Effect.fn(function* (
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

// Returns prefix if unused; otherwise appends integers starting at 2.
// e.g. findName('google', new Set(['google', 'google2'])) returns 'google3'.
export const findName = (prefix: string, used: Set<string>) => {
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

export const getClientNameAndProvider = Effect.fn(function* (
  providerType: typeof ClientTypeSchema.Type,
  opts: Record<string, unknown>,
) {
  const { auth, provider } = yield* getOrCreateProvider(providerType);
  const usedClientNames = new Set(
    (auth.oauth_clients ?? []).map((client) => client.client_name),
  );
  const suggestedClientName = findName(providerType, usedClientNames);

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
  return { provider, clientName };
});

export const findClientByIdOrName = Effect.fn(function* (params: {
  id?: string;
  name?: string;
}) {
  if (params.id && params.name) {
    return yield* BadArgsError.make({
      message: 'Cannot specify both --id and --name',
    });
  }
  if (!params.id && !params.name) {
    return yield* BadArgsError.make({
      message: 'Must specify --id or --name',
    });
  }

  const auth = yield* getAppsAuth();
  const clients = auth.oauth_clients ?? [];
  const client = params.id
    ? clients.find((entry) => entry.id === params.id)
    : clients.find((entry) => entry.client_name === params.name);

  if (!client) {
    const lookup = params.id ? `id ${params.id}` : `name ${params.name}`;
    return yield* BadArgsError.make({
      message: `OAuth client not found: ${lookup}`,
    });
  }

  return { auth, client };
});

export const removeAuthorizedOrigin = Effect.fn(function* (originId: string) {
  const http = (yield* InstantHttpAuthed).pipe(
    withCommand('auth origin delete'),
  );
  const { appId } = yield* CurrentApp;

  return yield* http
    .del(`/dash/apps/${appId}/authorized_redirect_origins/${originId}`)
    .pipe(
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(AuthorizedOriginResponse),
      ),
    );
});

export const addAuthorizedOrigin = Effect.fn(function* (params: {
  service: Schema.Schema.Type<typeof AuthorizedOriginService>;
  params: string[];
}) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth origin add'));
  const { appId } = yield* CurrentApp;

  return yield* http
    .post(`/dash/apps/${appId}/authorized_redirect_origins`, {
      body: HttpBody.unsafeJson({
        service: params.service,
        params: params.params,
      }),
    })
    .pipe(
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(AuthorizedOriginResponse),
      ),
    );
});
