import {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
  urlencoded,
} from 'express';
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
import {
  InvalidRequestError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

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

// https://github.com/modelcontextprotocol/modelcontextprotocol/issues/653
// Anthropic says it's fixed, but it doesn't seem like it
function patchClientForScopes(
  client: OAuthClientInformationFull,
): OAuthClientInformationFull {
  if (
    !client.scope ||
    // https://github.com/modelcontextprotocol/modelcontextprotocol/issues/653
    // Anthropic says it's fixed, but it doesn't seem like it
    client.scope?.includes('claudeai')
  ) {
    return { ...client, scope: 'apps-read apps-write' };
  }
  return client;
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
          ...(client.client_secret
            ? {
                client_secret: decrypt({
                  key: this.#keyConfig,
                  enc: client.client_secret,
                  aad: client.client_id,
                }),
              }
            : {}),
        } as OAuthClientInformationFull;
      },

      registerClient: async (rawClient: OAuthClientInformationFull) => {
        const client = {
          ...patchClientForScopes(rawClient),
        };

        await this.#db.transact(
          this.#db.tx.clients[id()].update({
            ...client,
            ...(client.client_secret
              ? {
                  client_secret: encrypt({
                    key: this.#keyConfig,
                    aad: client.client_id,
                    plaintext: client.client_secret,
                  }),
                }
              : {}),
          }),
        );
        return client;
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
          clientToken: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 1000 * 60 * 10).getTime(),
        })
        .link({ client: lookup('client_id', client.client_id) }),
    );
    res
      .cookie('__session', cookie, {
        httpOnly: true,
        secure: this.#oauthConfig.serverOrigin.startsWith('https'),
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
      throw new InvalidRequestError('Could not find OAuth request.');
    }

    await this.#db.transact(this.#db.tx.redirects[redirect.id].delete());

    const originalRedirectUri = redirect.authParams.redirectUri;
    if (originalRedirectUri !== redirectUri) {
      throw new InvalidRequestError('Invalid redirect_uri.');
    }

    if (!redirect.exchangedForInstantCode || !redirect.instantCode) {
      throw new InvalidRequestError(
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

interface ReqWithRedirect extends Request {
  oauthRedirect?: InstaQLResult<
    AppSchema,
    {
      redirects: {
        client: {};
      };
    }
  >['redirects'][number];
}

function useRedirectFromCookie(
  db: InstantAdminDatabase<AppSchema>,
): RequestHandler {
  return async (req: ReqWithRedirect, res: Response, next: NextFunction) => {
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

    req.oauthRedirect = redirect;
    next();
  };
}

async function cleanupRedirect(
  db: InstantAdminDatabase<AppSchema>,
  redirect: NonNullable<ReqWithRedirect['oauthRedirect']>,
) {
  await db.transact(db.tx.redirects[redirect.id].delete());
}

function oauthStartHtml(
  redirect: NonNullable<ReqWithRedirect['oauthRedirect']>,
) {
  const clientName = redirect.client?.client_name || 'Unknown client';
  const redirectUri = encodeURI(redirect.authParams.redirectUri);

  return /* HTML */ `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Authorize ${clientName}</title>
        <style>
          :root {
            --primary-color: #007bff;
            --primary-hover-color: #0056b3;
            --secondary-color: #6c757d;
            --secondary-hover-color: #5a6268;
            --bg-color: #f8f9fa;
            --card-bg-color: #ffffff;
            --text-color: #212529;
            --border-color: #dee2e6;
            --uri-bg-color: #e9ecef;
            --uri-border-color: #ced4da;
            --border-radius: 8px;
            --shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          }

          body {
            font-family: sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 1rem;
            box-sizing: border-box;
          }

          .container {
            background-color: var(--card-bg-color);
            padding: 2.5rem;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            max-width: 520px;
            width: 100%;
            /* CHANGED: Text is now left-aligned */
            text-align: left;
          }

          h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-top: 0;
            margin-bottom: 1rem;
          }

          p {
            line-height: 1.6;
            margin-bottom: 1rem; /* Adjusted margin for new layout */
          }

          .client-name {
            font-weight: 700;
            color: var(--primary-color);
          }

          /* NEW: Styling for the dedicated URL block */
          .uri-display {
            background-color: var(--uri-bg-color);
            padding: 0.75rem 1rem;
            margin-top: 0.5rem;
            margin-bottom: 2rem;
            border: 1px solid var(--uri-border-color);
            border-radius: 6px;
            font-family: 'Source Code Pro', monospace;
            word-break: break-all;
            font-size: 0.9rem;
            color: var(--text-color);
          }

          .actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-start; /* Aligns buttons to the left */
            margin-top: 2rem;
          }

          .actions form {
            flex: 1 1 0;
            display: flex;
          }

          .btn {
            display: inline-block;
            font-family: inherit;
            font-size: 1rem;
            font-weight: 500;
            padding: 0.75rem 1rem;
            border-radius: var(--border-radius);
            border: 1px solid transparent;
            cursor: pointer;
            transition:
              background-color 0.2s ease-in-out,
              color 0.2s ease-in-out,
              border-color 0.2s ease-in-out;
            width: 100%;
            text-decoration: none;
            text-align: center;
          }

          .btn-primary {
            background-color: var(--primary-color);
            color: white;
          }

          .btn-primary:hover {
            background-color: var(--primary-hover-color);
          }

          .btn-secondary {
            background-color: transparent;
            color: var(--secondary-color);
            border-color: var(--border-color);
          }

          .btn-secondary:hover {
            background-color: var(--secondary-color);
            color: white;
            border-color: var(--secondary-color);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Authorize Application</h1>
          <p>
            The application
            <strong class="client-name">${clientName}</strong> is requesting
            permission to access your InstantDB account.
          </p>

          <p>
            If you approve, you will first be sent to InstantDB to confirm, then
            you will be redirected to the application at the following address:
          </p>

          <div class="uri-display">${redirectUri}</div>

          <div class="actions">
            <form method="POST" action="/oauth/deny">
              <button type="submit" class="btn btn-secondary">Deny</button>
            </form>
            <form method="POST" action="/oauth/redirect-from-start">
              <input
                type="hidden"
                name="clientToken"
                value="${redirect.clientToken}"
              />
              <button type="submit" class="btn btn-primary">Authorize</button>
            </form>
          </div>
        </div>
      </body>
    </html>`;
}

async function oauthStart(
  db: InstantAdminDatabase<AppSchema>,
  req: ReqWithRedirect,
  res: Response,
) {
  const redirect = req.oauthRedirect!;
  if (redirect.shownConfirmPage) {
    await cleanupRedirect(db, redirect);
    res
      .status(400)
      .send('OAuth request is in an invalid state. Please try again.');
    return;
  }
  await db.transact(
    db.tx.redirects[redirect.id].update({ shownConfirmPage: true }),
  );

  res
    .status(200)
    .set('Content-Type', 'text/html; charset=UTF-8')
    .send(oauthStartHtml(redirect));
}

async function oauthRedirectFromStart(
  db: InstantAdminDatabase<AppSchema>,
  oauthConfig: OAuthConfig,
  req: ReqWithRedirect,
  res: Response,
) {
  const redirect = req.oauthRedirect!;

  if (!redirect.shownConfirmPage) {
    await cleanupRedirect(db, redirect);
    res
      .status(400)
      .send('OAuth request is in an invalid state. Please try again.');
    return;
  }

  if (
    !req.body.clientToken ||
    !crypto.timingSafeEqual(
      Buffer.from(req.body.clientToken, 'utf-8'),
      Buffer.from(redirect.clientToken, 'utf-8'),
    )
  ) {
    await cleanupRedirect(db, redirect);
    res.status(400).send('Invalid OAuth request. Please try again.');
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

  res.redirect(externalAuthUrl.toString());
}

async function oauthExternalRedirect(
  db: InstantAdminDatabase<AppSchema>,
  req: ReqWithRedirect,
  res: Response,
) {
  const redirect = req.oauthRedirect!;

  if (redirect.exchangedForInstantCode) {
    await cleanupRedirect(db, redirect);
    res.status(400).send('OAuth flow is expired, please try again.');
    return;
  }

  if (req.query.error) {
    await cleanupRedirect(db, redirect);
    const redirectUri = new URL(
      (redirect.authParams as AuthorizationParams).redirectUri,
    );
    redirectUri.searchParams.set('error', req.query.error as string);
    if (req.query.error_description) {
      redirectUri.searchParams.set(
        'error_description',
        req.query.error_description as string,
      );
    }
    res.redirect(redirectUri.toString());
    return;
  }

  const instantCode = req.query.code as string | undefined;

  if (!instantCode) {
    await cleanupRedirect(db, redirect);
    res
      .status(400)
      .send(
        'Could not complete OAuth flow, missing code param. Please try again.',
      );
    return;
  }

  const state = req.query.state;

  if (!state) {
    await cleanupRedirect(db, redirect);
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
    await cleanupRedirect(db, redirect);
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
    useRedirectFromCookie(db),
    async (req: Request, res: Response) => {
      return await oauthStart(db, req, res);
    },
  );

  app.post(
    '/oauth/redirect-from-start',
    cookieParser(),
    useRedirectFromCookie(db),
    urlencoded({ extended: true }),
    async (req: Request, res: Response) => {
      return await oauthRedirectFromStart(db, oauthConfig, req, res);
    },
  );

  app.post(
    '/oauth/deny',
    cookieParser(),
    useRedirectFromCookie(db),
    async (req: ReqWithRedirect, res: Response) => {
      const redirect = req.oauthRedirect!;
      await db.transact(db.tx.redirects[redirect.id].delete());
      const redirectUri = new URL(
        (redirect.authParams as AuthorizationParams).redirectUri,
      );
      redirectUri.searchParams.set('error', 'access_denied');
      res.redirect(redirectUri.toString());
    },
  );

  app.get(
    '/oauth/external-redirect',
    cookieParser(),
    useRedirectFromCookie(db),
    async (req: Request, res: Response) => {
      return await oauthExternalRedirect(db, req, res);
    },
  );
}
