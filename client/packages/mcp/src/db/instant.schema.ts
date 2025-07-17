// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/core';

const _schema = i.schema({
  // We inferred 4 attributes!
  // Take a look at this schema, and if everything looks good,
  // run `push schema` again to enforce the types.
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    clients: i.entity({
      client_id: i.string().unique().indexed(),
      client_id_issued_at: i.number().optional(),
      client_name: i.string().optional(),
      client_secret: i.string().optional(),
      client_secret_expires_at: i.number().optional(),
      client_uri: i.string().optional(),
      contacts: i.any().optional(),
      grant_types: i.json().optional(),
      jwks: i.any().optional(),
      jwks_uri: i.string().optional(),
      logo_uri: i.string().optional(),
      policy_uri: i.string().optional(),
      redirect_uris: i.json().optional(),
      response_types: i.json().optional(),
      scope: i.string().optional(),
      software_id: i.string().optional(),
      software_version: i.string().optional(),
      token_endpoint_auth_method: i.string().optional(),
      tos_uri: i.string().optional(),
    }),
    instantTokens: i.entity({
      accessToken: i.string(),
      expiresAt: i.date(),
      refreshToken: i.string(),
    }),
    mcpRefreshTokens: i.entity({
      scope: i.string(),
      tokenHash: i.string().unique(),
    }),
    mcpTokens: i.entity({
      expiresAt: i.date(),
      scope: i.string(),
      tokenHash: i.string().unique(),
    }),
    redirects: i.entity({
      authParams: i.json(),
      clientToken: i.string(),
      cookieHash: i.string().indexed(),
      exchangedForInstantCode: i.boolean().optional(),
      expiresAt: i.date(),
      instantCode: i.string().optional(),
      mcpCodeHash: i.string().indexed().optional(),
      shownConfirmPage: i.boolean().optional(),
      state: i.string(),
    }),
  },
  links: {
    instantTokensClient: {
      forward: {
        on: 'instantTokens',
        has: 'one',
        label: 'client',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'clients',
        has: 'many',
        label: 'instantTokens',
      },
    },
    mcpRefreshTokensClient: {
      forward: {
        on: 'mcpRefreshTokens',
        has: 'one',
        label: 'client',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'clients',
        has: 'many',
        label: 'mcpRefreshTokens',
      },
    },
    mcpRefreshTokensInstantToken: {
      forward: {
        on: 'mcpRefreshTokens',
        has: 'one',
        label: 'instantToken',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'instantTokens',
        has: 'one',
        label: 'mcpRefreshToken',
        onDelete: 'cascade',
      },
    },
    mcpRefreshTokensMcpTokens: {
      forward: {
        on: 'mcpRefreshTokens',
        has: 'many',
        label: 'mcpTokens',
        required: true,
      },
      reverse: {
        on: 'mcpTokens',
        has: 'one',
        label: 'mcpRefreshToken',
        onDelete: 'cascade',
      },
    },
    mcpTokensClient: {
      forward: {
        on: 'mcpTokens',
        has: 'one',
        label: 'client',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'clients',
        has: 'many',
        label: 'mcpTokens',
      },
    },
    mcpTokensInstantToken: {
      forward: {
        on: 'mcpTokens',
        has: 'one',
        label: 'instantToken',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'instantTokens',
        has: 'many',
        label: 'mcpTokens',
      },
    },
    redirectsClient: {
      forward: {
        on: 'redirects',
        has: 'one',
        label: 'client',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'clients',
        has: 'many',
        label: 'redirects',
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
