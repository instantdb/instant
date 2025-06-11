import { version as coreVersion } from '@instantdb/core';
import { pkceVerifier, pkceCodeChallengeOfVerifier } from './crypto.ts';
import { InstantOAuthError, OAuthScope } from './oauthCommon.ts';
import version from './version.js';

export type InstantDBOAuthAccessToken = {
  /**
   * Token that can be used to access the Instant platform API on behalf of a user
   */
  token: string;
  /**
   * The date when the token expires (2 weeks from when it was issued by default)
   */
  expiresAt: Date;
};

function getWindowOpts(): string {
  const windowWidth = Math.min(800, Math.floor(window.outerWidth * 0.8));
  const windowHeight = Math.min(630, Math.floor(window.outerHeight * 0.5));
  const windowArea = {
    width: windowWidth,
    height: windowHeight,
    left: Math.round(window.screenX + (window.outerWidth - windowWidth) / 2),
    top: Math.round(window.screenY + (window.outerHeight - windowHeight) / 8),
  };

  const opts: Record<string, number | string> = {
    width: windowArea.width,
    height: windowArea.height,
    left: windowArea.left,
    top: windowArea.top,
    toolbar: 0,
    scrollbars: 1,
    status: 1,
    resizable: 1,
    menuBar: 0,
    rel: 'opener',
  };

  return Object.keys(opts)
    .map((k) => `${k}=${opts[k]}`)
    .join(',');
}

let AUTH_WINDOW: null | Window = null;

function oAuthStartUrl({
  clientId,
  state,
  codeChallenge,
  apiURI,
  redirectUri,
  scopes,
}: {
  clientId: string;
  state: string;
  codeChallenge: string;
  apiURI: string;
  redirectUri: string;
  scopes: string[];
}): string {
  const oauthUrl = new URL(`${apiURI}/platform/oauth/start`);
  oauthUrl.searchParams.set('client_id', clientId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('scope', scopes.join(' '));
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('code_challenge', codeChallenge);
  oauthUrl.searchParams.set('code_challenge_method', 'S256');

  return oauthUrl.toString();
}

async function exchangeCodeForToken({
  code,
  clientId,
  verifier,
  apiURI,
  redirectUri,
}: {
  code: string;
  clientId: string;
  verifier: string;
  apiURI: string;
  redirectUri: string;
}): Promise<InstantDBOAuthAccessToken> {
  const res = await fetch(`${apiURI}/platform/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
      'Instant-Platform-Version': version,
      'Instant-Core-Version': coreVersion,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let error;

    try {
      const json = JSON.parse(text);
      error = {
        error: json.error,
        errorDescription: json.error_description,
        message: `OAuth error: ${json.error || 'server_error'}`,
      };
    } catch (e) {
      error = {
        error: 'server_error',
        message: 'OAuth error: server_error',
      };
    }

    throw new InstantOAuthError(error);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    token: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in - 30) * 1000),
  };
}

export function handleClientRedirect() {
  if (typeof window === 'undefined') {
    throw new Error('This function may only be used in a browser context.');
  }

  const searchParams = new URL(window.location.href).searchParams;

  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');

  if (!state) {
    throw new Error('Invalid redirect. The state param is missing.');
  }

  const channel = new BroadcastChannel(state);
  channel.addEventListener('message', (event) => {
    if (event.data.type === 'oauth-redirect-window-done') {
      window.close();
    }
  });
  channel.postMessage({
    type: 'oauth-redirect',
    state,
    error,
    errorDescription,
    code,
  });

  return () => {
    channel.close();
  };
}

export function startInstantOAuthClientOnlyFlow({
  clientId,
  apiURI,
  redirectUri,
  scopes,
}: {
  clientId: string;
  apiURI: string;
  redirectUri: string;
  scopes: OAuthScope[];
}): Promise<InstantDBOAuthAccessToken> {
  if (typeof window === 'undefined') {
    throw new Error('OAuth flow can only be started on the client.');
  }

  const existingAuthWindow = AUTH_WINDOW;

  if (existingAuthWindow) {
    existingAuthWindow.close();
  }

  const state = crypto.randomUUID();

  const verifier = pkceVerifier();

  const channel = new BroadcastChannel(state);

  const flowCompletePromise: Promise<InstantDBOAuthAccessToken> = new Promise(
    (resolve, reject) => {
      channel.addEventListener('message', async (event) => {
        if (event.data.type !== 'oauth-redirect') {
          return;
        }

        const {
          state: redirectState,
          error,
          code,
          errorDescription,
        } = event.data;

        if (!redirectState || redirectState !== state) {
          return;
        }

        if (code) {
          try {
            const token = await exchangeCodeForToken({
              clientId,
              code,
              verifier,
              apiURI,
              redirectUri,
            });
            resolve(token);
          } catch (e) {
            if (e instanceof InstantOAuthError) {
              reject(e);
            }
            reject(
              new InstantOAuthError({
                error: 'server_error',
                message: 'OAuth error exchanging code for token',
              }),
            );
          }
        } else if (typeof error === 'string') {
          reject(
            new InstantOAuthError({
              error,
              errorDescription,
              message: `OAuth error: ${error}`,
            }),
          );
        } else {
          reject(
            new InstantOAuthError({
              error: 'server_error',
              message: 'OAuth error: server_error',
            }),
          );
        }

        channel.postMessage({ type: 'oauth-redirect-window-done' });
      });
    },
  );

  const w = window.open(
    // Open window synchronously to prevent popup blocker
    '',
    // A unqiue name prevents orphaned popups from stealing our window.open
    `instantdb_oauth_${Math.random()}`.replace('.', ''),
    getWindowOpts(),
  );

  if (!w) {
    return Promise.reject({ error: 'Could not open Auth window' });
  }

  AUTH_WINDOW = w;

  pkceCodeChallengeOfVerifier(verifier).then((codeChallenge) => {
    const oauthUrl = oAuthStartUrl({
      clientId,
      state,
      codeChallenge,
      apiURI,
      redirectUri,
      scopes,
    });
    w.location.href = oauthUrl;
  });

  return flowCompletePromise.finally(() => channel.close());
}

/**
 * Configuration for {@link OAuthHandler}.
 */
export interface OAuthHandlerConfig {
  /**
   * Must exactly match one of the **Authorized Redirect URIs** in your OAuth
   * client settings on the Instant dashboard.
   */
  redirectUri: string;

  /** OAuth client ID from the Instant dashboard. */
  clientId: string;

  /**
   * Optional Instant API base-URL.
   * Defaults to `https://api.instantdb.com`.
   */
  apiURI?: string | null;
}

/**
 * Thin wrapper that drives InstantDB’s browser-only OAuth flow.
 */
export class OAuthHandler {
  /** Redirect URI that the provider will call back into. */
  readonly redirectUri: string;

  /** OAuth client ID. */
  readonly clientId: string;

  /**
   * Base URL for InstantDB’s REST API.
   * Defaults to `https://api.instantdb.com`.
   */
  readonly apiURI: string;

  constructor(config: OAuthHandlerConfig) {
    this.redirectUri = config.redirectUri;
    this.apiURI = config.apiURI ?? 'https://api.instantdb.com';
    this.clientId = config.clientId;
  }

  /**
   * **Client-only flow** using PKCE (no client-secret required).
   * Opens a popup to start the OAuth flow.
   * Returns an {@link InstantDBOAuthAccessToken}.
   * *Refresh tokens are **not** available in this flow.*
   *
   * @example
   * const oauthHandler = new OAuthHandler({
   *   clientId: YOUR_CLIENT_ID,
   *   redirectUri: YOUR_REDIRECT_URI,
   * });
   *
   * function ConnectToInstant() {
   *   const handleConnect = async () => {
   *     try {
   *       const token = await oauthHandler.startClientOnlyFlow(['apps-write']);
   *       console.log('success!', token)
   *     } catch (e) {
   *       console.log('OAuth flow failed', e);
   *     }
   *   }
   *   return <button onClick={handleConnect}>Connect to Instant</button>
   * }
   */
  startClientOnlyFlow(
    scopes: OAuthScope[],
  ): Promise<InstantDBOAuthAccessToken> {
    return startInstantOAuthClientOnlyFlow({
      clientId: this.clientId,
      apiURI: this.apiURI,
      redirectUri: this.redirectUri,
      scopes,
    });
  }

  /**
   * Call from the page served at {@link OAuthHandlerConfig.redirectUri}.
   * Parses `state` & `code` from the URL, exchanges them for an access token,
   * then automatically closes the popup/window.
   *
   * @example
   * ```tsx
   * const oauthHandler = new OAuthHandler({
   *   clientId: YOUR_CLIENT_ID,
   *   redirectUri: YOUR_REDIRECT_URI,
   * })
   *
   * function RedirectPage() {
   *   useEffect(() => {
   *     return oauthHandler.handleClientRedirect();
   *   }, []);
   *   return <div>Loading…</div>;
   * }
   * ```
   */
  handleClientRedirect(): () => void {
    return handleClientRedirect();
  }
}
