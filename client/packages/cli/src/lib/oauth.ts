import { HttpBody, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { InstantHttpAuthed, withCommand } from './http.ts';

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

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_DISCOVERY_ENDPOINT =
  'https://accounts.google.com/.well-known/openid-configuration';
export const GOOGLE_DEFAULT_CALLBACK_URL =
  'https://api.instantdb.com/runtime/oauth/callback';

const NullableArray = <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  Schema.Union(Schema.Array(schema).pipe(Schema.mutable), Schema.Null).pipe(
    Schema.optional,
  );

export const AppsAuthResponse = Schema.Struct({
  authorized_redirect_origins: NullableArray(AuthorizedOrigin),
  oauth_service_providers: NullableArray(OAuthServiceProvider),
  oauth_clients: NullableArray(OAuthClient),
});

export const getAppsAuth = Effect.fn(function* (appId?: string) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('auth'));
  const targetAppId = appId ?? (yield* CurrentApp).appId;

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
