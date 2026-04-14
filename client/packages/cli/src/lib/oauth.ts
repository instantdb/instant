import { HttpBody, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from './http.ts';
import chalk from 'chalk';
import {
  getOptionalStringFlag,
  optionalOptOrPrompt,
  runUIEffect,
  stripFirstBlankLine,
} from './ui.ts';
import { UI } from '../ui/index.ts';
import { BadArgsError } from '../errors.ts';

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

const NullableString = Schema.Union(Schema.String, Schema.Null).pipe(
  Schema.optional,
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
  meta: Schema.Any.pipe(Schema.optional),
});

export const AddOAuthProviderResponse = Schema.Struct({
  provider: OAuthServiceProvider,
});

export const AddOAuthClientResponse = Schema.Struct({
  client: OAuthClient,
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
${chalk.dim('With a custom redirect URL, users will instead see "Redirecting to yoursite.com..." for a more branded experience.')}
${chalk.dim('Your URL must forward to https://api.instantdb.com/runtime/oauth/callback with all query parameters preserved.')}\n\n` +
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
