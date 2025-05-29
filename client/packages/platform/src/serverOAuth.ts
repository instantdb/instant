import { InstantOAuthError } from './oauthCommon.ts';

async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
  apiURI,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiURI: string;
}) {
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
  };

  return {
    token: json.access_token,
    expiresAt: new Date((json.expires_in - 30) * 1000),
    refreshToken: json.refresh_token,
  };
}

