---
title: GitHub OAuth
description: How to add GitHub OAuth to your Instant app.
---

{% nav-default value="web-redirect" %}

Instant supports logging users in with their GitHub account. GitHub uses OAuth 2.0 for authentication, which provides a secure way for users to sign in without sharing their passwords.

Choose the option that sounds best to you, and the rest of the document will show you how to add Sign in with GitHub to your app.

{% div className="not-prose" %}
{% div className="grid md:grid-cols-2 gap-4" %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for Web?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-1 flex-1 gap-4" %}
{% nav-button
  title="Web Redirect"
  description="Standard OAuth flow with redirect-based authentication."
  param="method"
  value="web-redirect" /%}
{% /div %}
{% /div %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for React Native?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-1 flex-1 gap-4" %}
{% nav-button
  title="Expo Web Auth"
  description="Use Expo's auth session for browser-based sign-in in mobile apps."
  param="method"
  value="rn-web" /%}
{% /div %}
{% /div %}
{% /div %}
{% /div %}

## Overview

There are three main steps:

1. **GitHub Developer Settings**: Create an OAuth App.
2. **Instant Dashboard**: Connect your OAuth App to Instant.
3. **Your app**: Add code to log in with GitHub!

Let's dive deeper into each step:

## 1. Create an OAuth App

1. Go to your GitHub account [Developer settings](https://github.com/settings/developers).
2. Click on "OAuth Apps" in the sidebar.
3. Click "New OAuth App" (or "Register a new application" if it's your first).
4. Fill in the application details:
   - **Application name**: Your app's name (users will see this)
   - **Homepage URL**: Your app's website
   - **Authorization callback URL**: `https://api.instantdb.com/runtime/oauth/callback`
5. Click "Register application".
6. After creation, you'll see your **Client ID**.
7. Click "Generate a new client secret" to get your **Client Secret**.

## 2. Connect your OAuth App to Instant

Go to the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Instant dashboard" /%} and select the `Auth` tab for your app.

**Add your OAuth App on Instant**

- Click "Set up GitHub"
- Enter a unique name for your client (e.g., "github-web")
- Enter your "Client ID" from GitHub
- Enter your "Client Secret" from GitHub
- Click "Add Client"

{% conditional param="method" value="web-redirect" %}

**Register your website with Instant**

In the `Auth` tab, add the URL of the websites where you are using Instant to the Redirect Origins.
If you're testing from localhost, add `http://localhost:3000`, replacing `3000` with the port you use.
For production, add your website's domain.

{% /conditional %}

And voila, you are connected!

## 3. Add some code!

{% conditional param="method" value="web-redirect" %}

**Method: Web Redirect**

Create an authorization URL via `db.auth.createAuthorizationURL` and then use the url to create a link. Here's a full example:

```jsx {% showCopy=true %}
'use client';

import React from 'react';
import { init } from '@instantdb/react';

const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

export default function App() {
  const url = db.auth.createAuthorizationURL({
    // Use the GitHub client name from the Instant dashboard auth tab
    clientName: 'github-web',
    redirectURL: window.location.href,
  });

  return (
    <>
      <db.SignedIn>
        <UserInfo />
      </db.SignedIn>
      <db.SignedOut>
        <Login url={url} />
      </db.SignedOut>
    </>
  );
}

function UserInfo() {
  const user = db.useUser();
  return <h1>Hello {user.email}!</h1>;
}

function Login({ url }) {
  return <a href={url}>Log in with GitHub</a>;
}
```

When your users click on the link, they'll be redirected to GitHub to authorize your app, then back to your site.

Instant will automatically log them in to your app when they are redirected!

{% /conditional %}

{% conditional param="method" value="rn-web" %}

**Method: Expo Web Auth**

Instant comes with support for Expo's AuthSession library. To use it, you need to:

1. Set up AuthSession
2. Register your app with Instant
3. Use AuthSession to log in with GitHub!

Let's do that.

**Set up AuthSession**

If you haven't already, follow the AuthSession {% blank-link href="https://docs.expo.dev/versions/latest/sdk/auth-session/" label="installation instructions" /%} from the Expo docs.

Next, add the following dependencies:

```shell {% showCopy=true %}
npx expo install expo-auth-session expo-crypto
```

Update your app.json with your scheme:

```json {% showCopy=true %}
{
  "expo": {
    "scheme": "mycoolredirect"
  }
}
```

**Register your app with Instant**

Now that you have your App Scheme, it's time to tell Instant about it.

From the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Auth" /%} tab on the Instant dashboard, add a redirect origin of type "App scheme". For development with expo add `exp://` and your scheme, e.g. `mycoolredirect://`.

{% screenshot src="/img/docs/rn-web-redirect-origins.png" /%}

**Use AuthSession to log in with GitHub!**

And from here you're ready to add a login button to your expo app! Here's a full example:

```jsx {% showCopy=true %}
import { View, Text, Button } from 'react-native';
import { init } from '@instantdb/react-native';
import {
  makeRedirectUri,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  return (
    <>
      <db.SignedIn>
        <UserInfo />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}

function UserInfo() {
  const user = db.useUser();
  return (
    <View>
      <Text>Hello {user.email}!</Text>
      <Button title="Log out" onPress={() => db.auth.signOut()}></Button>
    </View>
  );
}

function Login() {
  const discovery = useAutoDiscovery(db.auth.issuerURI());

  const [request, _response, promptAsync] = useAuthRequest(
    {
      // The unique name you gave the OAuth client when you
      // registered it on the Instant dashboard
      clientId: 'github-web',
      redirectUri: makeRedirectUri(),
    },
    discovery,
  );

  return (
    <Button
      title="Log in with GitHub"
      disabled={!request}
      onPress={async () => {
        try {
          const res = await promptAsync();
          if (res.type === 'success') {
            await db.auth.exchangeOAuthCode({
              code: res.params.code,
              codeVerifier: request?.codeVerifier,
            });
          }
        } catch (e) {
          console.error(e);
        }
      }}
    />
  );
}

export default App;
```

{% /conditional %}

## Email Visibility

GitHub users can choose to make their email addresses private. If a user has a private email:

- Instant will use GitHub's no-reply email address (e.g., `123456+username@users.noreply.github.com`)
- This ensures users can still authenticate even with private emails
- The email is still unique and consistent for each user

## Scopes

GitHub uses OAuth scopes to control access. The basic scopes Instant requests are:

- `read:user` - Read access to profile information
- `user:email` - Read access to email addresses
