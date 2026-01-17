import { InstantOAuthError } from './oauthCommon.ts';

export async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
  apiURI = 'https://api.instantdb.com',
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiURI?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  tokenType: 'Bearer';
}> {
  const res = await fetch(`${apiURI}/platform/oauth/token`, {
    method: 'POST',
    headers: { 'Content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
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
    refresh_token: string;
    expires_in: number;
    scopes: string;
    token_type: 'Bearer';
  };

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in - 30) * 1000),
    refreshToken: json.refresh_token,
    scopes: json.scopes,
    tokenType: json.token_type,
  };
}

export async function exchangeRefreshToken({
  clientId,
  clientSecret,
  refreshToken,
  apiURI = 'https://api.instantdb.com',
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiURI?: string;
}): Promise<{
  accessToken: string;
  expiresAt: Date;
  scopes: string;
  tokenType: 'Bearer';
}> {
  const res = await fetch(`${apiURI}/platform/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scopes: string;
    token_type: 'Bearer';
  };

  return {
    accessToken: json.access_token,
    expiresAt: new Date((json.expires_in - 30) * 1000),
    scopes: json.scopes,
    tokenType: json.token_type,
  };
}
