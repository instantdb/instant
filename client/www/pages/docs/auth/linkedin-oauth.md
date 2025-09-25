---
title: LinkedIn OAuth
description: Configure Sign in with LinkedIn for your Instant app.
---

LinkedIn supports [OpenID Connect](https://learn.microsoft.com/linkedin/shared/authentication) so you can let your users sign in to your Instant app with the same account they use on LinkedIn.

{% callout type="info" %}
This guide covers the Instant dashboard configuration and how to exchange LinkedIn authorization codes for ID tokens. Once you have the ID token you can call `db.auth.signInWithIdToken` just like any other OpenID provider.
{% /callout %}

## Create a LinkedIn app

1. Head to the [LinkedIn developer portal](https://www.linkedin.com/developers/apps) and create a new application (or open an existing one).
2. In the **Auth** tab enable **Sign In with LinkedIn**.
3. Add the following redirect URI to your application:

```text
https://api.instantdb.com/runtime/oauth/callback
```

LinkedIn requires an exact match for every redirect URL you use. If you also run the API locally during development, add `http://localhost:8888/runtime/oauth/callback` as another redirect URL.

## Add a LinkedIn provider in Instant

1. Open the **Auth** tab for your Instant app.
2. Click **Setup LinkedIn**. This creates a provider where you can register one or more OAuth clients.
3. For each environment (web, native, etc.) click **Add LinkedIn client** and provide:
   - A unique client name (for example `linkedin-web`).
   - The **Client ID** and **Client Secret** from the LinkedIn developer portal.

Instant will automatically discover LinkedIn's OpenID configuration and pull in the JWKS used to verify ID tokens.

## Exchange the authorization code for an ID token

When a user is redirected back to your app from LinkedIn you will receive an authorization code. Exchange that code on your server for an ID token and then hand it to Instant:

```ts
import { init } from '@instantdb/react';

const db = init({ appId: 'YOUR_APP_ID' });

async function finishLinkedInLogin(params: URLSearchParams) {
  if (!params.get('code')) {
    return;
  }

  const { id_token } = await fetch('/api/linkedin/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: params.get('code'),
      redirectUri: `${window.location.origin}/linkedin/callback`,
    }),
  }).then((r) => r.json());

  await db.auth.signInWithIdToken({
    clientName: 'linkedin-web',
    idToken: id_token,
  });
}
```

Your `/api/linkedin/token` endpoint should make a POST request to `https://www.linkedin.com/oauth/v2/accessToken` with your client ID, client secret, the authorization code, and the redirect URI. The response includes an `id_token` that Instant validates before creating or updating the user inside your app.

## Testing locally

The Instant dashboard development environment (`http://localhost:3000`) automatically passes `redirect_to_dev=true` when it starts an OAuth flow. If you want to test your own app locally make sure to add the local redirect URI to the LinkedIn app and provide `redirect_to_dev=true` when hitting `/dash/oauth/start?service=linkedin` from your environment.

That's it! You now have Sign in with LinkedIn working through Instant.
