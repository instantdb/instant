import { Express, Request, Response } from 'express';
import crypto from 'crypto';
import {
  id,
  InstantAdminDatabase,
  InstaQLEntity,
  InstaQLResult,
  lookup,
} from '@instantdb/admin';
import { AppSchema } from './db/instant.schema.ts';
import {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { decrypt, encrypt, hash, KeyConfig } from './crypto.ts';
import { exchangeCodeForToken } from '@instantdb/platform';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { PlatformApiAuth } from '../../platform/dist/esm/api.js';
import { PlatformApi } from '@instantdb/platform';
import cookieParser from 'cookie-parser';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  serverOrigin: string;
};

export async function tokensOfBearerToken(
  db: InstantAdminDatabase<AppSchema>,
  token: string,
): Promise<{
  mcpToken: InstaQLResult<
    AppSchema,
    { mcpTokens: { client: {}; instantToken: {} } }
  >['mcpTokens'][number];
  instantToken: InstaQLEntity<AppSchema, 'instantTokens'>;
}> {
  const queryRes = await db.query({
    mcpTokens: {
      $: {
        where: {
          tokenHash: hash(token),
        },
      },
      client: {},
      instantToken: {},
    },
  });

  const tokenEnt = queryRes.mcpTokens[0];
  if (!tokenEnt) {
    throw new InvalidTokenError('Token not found.');
  }

  return { mcpToken: tokenEnt, instantToken: tokenEnt.instantToken! };
}

export function makeApiAuth(
  oauthConfig: OAuthConfig,
  key: KeyConfig,
  db: InstantAdminDatabase<AppSchema>,
  instantTokenEnt: InstaQLEntity<AppSchema, 'instantTokens'>,
): PlatformApiAuth {
  return {
    accessToken: decrypt({
      key,
      enc: instantTokenEnt.accessToken,
      aad: instantTokenEnt.id,
    }),
    refreshToken: decrypt({
      key,
      enc: instantTokenEnt.refreshToken,
      aad: instantTokenEnt.id,
    }),
    clientId: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    onRefresh: async ({ accessToken, expiresAt }) => {
      await db.transact(
        db.tx.instantTokens[instantTokenEnt.id].update({
          accessToken: encrypt({
            key,
            aad: instantTokenEnt.id,
            plaintext: accessToken,
          }),
          expiresAt: expiresAt.getTime(),
        }),
      );
    },
  };
}

export class ServiceProvider implements OAuthServerProvider {
  #db: InstantAdminDatabase<AppSchema>;
  #oauthConfig: OAuthConfig;
  #keyConfig: KeyConfig;

  constructor(
    db: InstantAdminDatabase<AppSchema>,
    oauthConfig: OAuthConfig,
    keyConfig: KeyConfig,
  ) {
    this.#db = db;
    this.#oauthConfig = oauthConfig;
    this.#keyConfig = keyConfig;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => {
        const res = await this.#db.query({
          clients: { $: { where: { client_id: clientId } } },
        });
        const client = res.clients[0];
        if (!client) {
          return undefined;
        }

        return {
          ...client,
          client_secret: decrypt({
            key: this.#keyConfig,
            enc: client.client_secret,
            aad: client.client_id,
          }),
        } as OAuthClientInformationFull;
      },

      registerClient: async (client: OAuthClientInformationFull) => {
        const clientSecret = crypto.randomUUID();
        await this.#db.transact(
          this.#db.tx.clients[id()].update({
            ...client,
            client_secret: encrypt({
              key: this.#keyConfig,
              aad: client.client_id,
              plaintext: clientSecret,
            }),
          }),
        );
        return { ...client, client_secret: clientSecret };
      },
    };
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Tag the cookie with a prefix in case multiple have the same key
    const cookie = `_imcp_${crypto.randomUUID()}`;
    const cookieHash = hash(cookie);
    const state = crypto.randomUUID();

    await this.#db.transact(
      this.#db.tx.redirects[id()]
        .update({
          cookieHash,
          authParams: params,
          state,
          expiresAt: new Date(Date.now() + 1000 * 60 * 10).getTime(),
        })
        .link({ client: lookup('client_id', client.client_id) }),
    );
    res
      .cookie('__session', cookie, {
        httpOnly: true,
        secure: false, // XXX: Check if dev
        sameSite: 'lax',
        path: '/oauth',
        expires: new Date(Date.now() + 1000 * 60 * 5),
      })
      .redirect('/oauth/start');
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const mcpCodeHash = hash(authorizationCode);

    const queryRes = await this.#db.query({
      redirects: { $: { where: { mcpCodeHash } } },
    });

    const redirect = queryRes.redirects[0];

    if (!redirect) {
      throw new Error('Could not find OAuth request.');
    }

    if (!redirect.exchangedForInstantCode) {
      throw new Error(
        'OAuth flow is in an invalid state. Expected to exchange a code for a token first.',
      );
    }

    return redirect.authParams.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    // Already checked in `challengeForAuthorizationCode`
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const mcpCodeHash = hash(authorizationCode);

    const queryRes = await this.#db.query({
      redirects: { $: { where: { mcpCodeHash } } },
    });

    const redirect = queryRes.redirects[0];

    if (!redirect) {
      throw new Error('Could not find OAuth request.');
    }

    await this.#db.transact(this.#db.tx.redirects[redirect.id].delete());

    const originalRedirectUri = redirect.authParams.redirectUri;
    if (originalRedirectUri !== redirectUri) {
      throw new Error('Invalid redirect_uri.');
    }

    if (!redirect.exchangedForInstantCode || !redirect.instantCode) {
      throw new Error(
        'OAuth flow is in an invalid state. Expected to exchange a code for a token first.',
      );
    }

    const code = redirect.instantCode;

    const tokenInfo = await exchangeCodeForToken({
      code,
      clientId: this.#oauthConfig.clientId,
      clientSecret: this.#oauthConfig.clientSecret,
      redirectUri: `${this.#oauthConfig.serverOrigin}/oauth/external-redirect`,
    });

    const instantTokenExpiresAt = tokenInfo.expiresAt;
    const mcpTokenExpiresAt = new Date(
      instantTokenExpiresAt.getTime() - 1000 * 60 * 60,
    );

    const mcpToken = `at_${crypto.randomUUID()}`;
    const mcpRefreshToken = `rt_${crypto.randomUUID()}`;
    const mcpTokenId = id();
    const mcpRefreshTokenId = id();
    const instantTokenId = id();

    await this.#db.transact([
      this.#db.tx.instantTokens[instantTokenId]
        .update({
          accessToken: encrypt({
            key: this.#keyConfig,
            aad: instantTokenId,
            plaintext: tokenInfo.accessToken,
          }),
          expiresAt: instantTokenExpiresAt.getTime(),
          refreshToken: encrypt({
            key: this.#keyConfig,
            aad: instantTokenId,
            plaintext: tokenInfo.refreshToken,
          }),
        })
        .link({ client: lookup('client_id', client.client_id) }),
      this.#db.tx.mcpTokens[mcpTokenId]
        .update({
          tokenHash: hash(mcpToken),
          expiresAt: mcpTokenExpiresAt.getTime(),
          scope: tokenInfo.scopes,
        })
        .link({ instantToken: instantTokenId })
        .link({ mcpRefreshToken: mcpRefreshTokenId })
        .link({ client: lookup('client_id', client.client_id) }),
      this.#db.tx.mcpRefreshTokens[mcpRefreshTokenId]
        .update({
          tokenHash: hash(mcpRefreshToken),
          scope: tokenInfo.scopes,
        })
        .link({ instantToken: instantTokenId })
        .link({ client: lookup('client_id', client.client_id) }),
    ]);

    return {
      access_token: mcpToken,
      token_type: 'bearer',
      expires_in: Math.floor((mcpTokenExpiresAt.getTime() - Date.now()) / 1000),
      scope: tokenInfo.scopes,
      refresh_token: mcpRefreshToken,
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
  ): Promise<OAuthTokens> {
    const queryRes = await this.#db.query({
      mcpRefreshTokens: {
        $: {
          where: {
            tokenHash: hash(refreshToken),
          },
        },
        client: {},
        instantToken: {},
      },
    });

    const tokenEnt = queryRes.mcpRefreshTokens[0];
    if (!tokenEnt) {
      throw new InvalidTokenError('Token not found.');
    }

    if (client.client_id !== tokenEnt.client!.client_id) {
      throw new InvalidTokenError('Refresh token does not belong to client.');
    }

    const mcpToken = `at_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).getTime();
    await this.#db.transact(
      this.#db.tx.mcpTokens[id()]
        .update({
          tokenHash: hash(mcpToken),
          expiresAt,
          scope: tokenEnt.scope,
        })
        // instantToken is required, so we should be able to fix the types
        // so we don't need the `!`s
        .link({ instantToken: tokenEnt.instantToken!.id })
        .link({ mcpRefreshToken: tokenEnt.id })
        .link({ client: lookup('client_id', client.client_id) }),
    );
    return {
      access_token: mcpToken,
      token_type: 'bearer',
      expires_in: Math.floor((Date.now() - expiresAt) / 1000),
      refresh_token: refreshToken,
      scope: tokenEnt.scope,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { instantToken, mcpToken } = await tokensOfBearerToken(
      this.#db,
      token,
    );
    const api = new PlatformApi({
      auth: makeApiAuth(
        this.#oauthConfig,
        this.#keyConfig,
        this.#db,
        instantToken,
      ),
    });

    try {
      await api.tokenInfo();
    } catch (e) {
      throw new InvalidTokenError(
        e instanceof Error ? e.message : 'Invalid token',
      );
    }

    return {
      clientId: mcpToken.client!.client_id,
      scopes: mcpToken.scope.split(' '),
      token,
      expiresAt: new Date(mcpToken.expiresAt).getTime(),
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const tokenHash = hash(request.token);

    await this.#db.transact([
      this.#db.tx.mcpTokens[lookup('tokenHash', tokenHash)].delete(),
      this.#db.tx.mcpRefreshTokens[lookup('tokenHash', tokenHash)].delete(),
    ]);
  }
}

async function oauthStart(
  db: InstantAdminDatabase<AppSchema>,
  oauthConfig: OAuthConfig,
  req: Request,
  res: Response,
) {
  const cookie = req.cookies.__session;
  if (!cookie) {
    res.status(400).send('Missing cookie, cannot complete OAuth flow.');
    return;
  }
  const cookieHash = hash(cookie);

  const queryRes = await db.query({
    redirects: {
      $: { where: { cookieHash } },
      client: {},
    },
  });

  const redirect = queryRes.redirects[0];

  if (!redirect) {
    res.status(400).send('Could not find OAuth flow, please try again.');
    return;
  }

  if (new Date(redirect.expiresAt) < new Date()) {
    await db.transact(db.tx.redirects[redirect.id].delete());
    res.status(400).send('OAuth flow is expired, please try again.');
    return;
  }

  const externalAuthUrl = new URL(
    `https://api.instantdb.com/platform/oauth/start`,
  );
  externalAuthUrl.searchParams.set('client_id', oauthConfig.clientId);
  externalAuthUrl.searchParams.set('response_type', 'code');
  externalAuthUrl.searchParams.set('state', redirect.state);
  externalAuthUrl.searchParams.set(
    'scope',
    redirect.authParams.scopes?.join(' ') ||
      redirect.client!.scope ||
      'apps-read apps-write',
  );

  externalAuthUrl.searchParams.set(
    'redirect_uri',
    `${oauthConfig.serverOrigin}/oauth/external-redirect`,
  );

  // XXX: Needs a consent screen

  res.redirect(externalAuthUrl.toString());
}

async function oauthExternalRedirect(
  db: InstantAdminDatabase<AppSchema>,
  req: Request,
  res: Response,
) {
  const cookie = req.cookies.__session;
  if (!cookie) {
    res.status(400).send('Missing cookie, cannot complete OAuth flow.');
    return;
  }
  const cookieHash = hash(cookie);

  const queryRes = await db.query({
    redirects: {
      $: { where: { cookieHash } },
      client: {},
    },
  });

  const redirect = queryRes.redirects[0];

  if (!redirect) {
    res.status(400).send('Could not find OAuth flow, please try again.');
    return;
  }

  if (
    new Date(redirect.expiresAt) < new Date() ||
    redirect.exchangedForInstantCode
  ) {
    await db.transact(db.tx.redirects[redirect.id].delete());
    res.status(400).send('OAuth flow is expired, please try again.');
    return;
  }

  const instantCode = req.query.code as string | undefined;

  if (!instantCode) {
    res
      .status(400)
      .send(
        'Could not complete OAuth flow, missing code param. Please try again.',
      );
    return;
  }

  const state = req.query.state;

  if (!state) {
    res
      .status(400)
      .send(
        'Could not complete OAuth flow, missing state param. Please try again.',
      );
    return;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(state as string),
      Buffer.from(redirect.state),
    )
  ) {
    res
      .status(400)
      .send(
        'Could not complete OAuth flow, invalid state param. Please try again.',
      );
    return;
  }

  const mcpCode = crypto.randomUUID();
  const mcpCodeHash = hash(mcpCode);

  await db.transact(
    db.tx.redirects[redirect.id].update({
      instantCode,
      mcpCodeHash,
      exchangedForInstantCode: true,
    }),
  );

  const mcpRedirectUri = new URL(redirect.authParams.redirectUri);

  mcpRedirectUri.searchParams.set('code', mcpCode);
  if (redirect.authParams.state) {
    mcpRedirectUri.searchParams.set('state', redirect.authParams.state);
  }

  res.redirect(mcpRedirectUri.toString());
}

export function addOAuthRoutes(
  app: Express,
  db: InstantAdminDatabase<AppSchema>,
  oauthConfig: OAuthConfig,
) {
  app.get(
    '/oauth/start',
    cookieParser(),
    async (req: Request, res: Response) => {
      return await oauthStart(db, oauthConfig, req, res);
    },
  );

  app.get(
    '/oauth/external-redirect',
    cookieParser(),
    async (req: Request, res: Response) => {
      return await oauthExternalRedirect(db, req, res);
    },
  );
}
