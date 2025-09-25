---
title: LinkedIn OAuth
description: How to add LinkedIn OAuth to your Instant app.
---

{% nav-default value="web-redirect" %}

Instant supports logging users in with their LinkedIn account. There are a few ways to do this: it depends on whether you are building for web or React Native.

Choose the option that sounds best to you, and the rest of the document will show you how to add Sign in with LinkedIn to your app.

{% div className="not-prose" %}
{% div className="grid md:grid-cols-2 gap-4" %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for Web?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-1 flex-1 gap-4" %}
{% nav-button
  title="Web Redirect"
  description="Easier to integrate, but doesn't let you render your custom app name."
  param="method"
  value="web-redirect" /%}
{% /div %}
{% /div %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for React Native?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-1 flex-1 gap-4" %}
{% nav-button
  title="Expo Web Auth"
  description="Use Expo's auth session to integrate browser-based sign-in. Easier to implement, but doesn't let you render your custom app name."
  param="method"
  value="rn-web" /%}
{% /div %}
{% /div %}
{% /div %}
{% /div %}

## Overview

There are three main steps:

1. **LinkedIn Developer Console**: Create an Oauth client.
2. **Instant Dashboard**: Connect your Oauth client to Instant
3. **Your app**: Add some code to log in with LinkedIn!

Let's dive deeper in each step:

## 1. Create an Oauth client

1. Head to the [LinkedIn developer portal](https://www.linkedin.com/developers/apps) and create a new application (or open an existing one).
2. In the **Auth** tab enable **Sign In with LinkedIn**.
3. Add the following redirect URI to your application:

```text
https://api.instantdb.com/runtime/oauth/callback
```

{% callout type="note" %}

Save your Client ID and your Client Secret -- you'll need it for the next step!

{% /callout %}

## 2. Connect your Oauth client to Instant

Go to the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Instant dashboard" /%} and select the `Auth` tab for your app.

**Add your Oauth Client on Instant**

- Click "Set up LinkedIn"
- Enter your "Client ID"
- Enter your "Client Secret"
- Click "Add Client"

{% conditional param="method" value="web-redirect" %}

**Register your website with Instant**

In the `Auth` tab, add the url of the websites where you are using Instant to the Redirect Origins.
If you're testing from localhost, add `http://localhost:3000`, replacing `3000` with the port you use.
For production, add your website's domain.

{% /conditional %}

And voila, you are connected!

## 3. Add some code!

{% conditional param="method" value="web-redirect" %}

**Method: Web Redirect**

Create an authorization URL via `db.auth.createAuthorizationURL` and then use the url to create a link. Here's a full example:

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';

const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

const url = db.auth.createAuthorizationURL({
  // Use the linkedin client name in the Instant dashboard auth tab
  clientName: 'REPLACE_ME',
  redirectURL: window.location.href,
});

import React from 'react';

export default function App() {
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
  return <h1>Hello {user.email}!</h1>;
}

function Login() {
  return <a href={url}>Log in with LinkedIn</a>;
}
```

When your users clicks on the link, they'll be redirected to LinkedIn to start the OAuth flow and then back to your site.

Instant will automatically log them in to your app when they are redirected!

{% /conditional %}

{% conditional param="method" value="rn-web" %}

**Method: Expo Web Auth**

Instant comes with support for Expo's AuthSession library. To use it, you need to:

1. Set up AuthSession
2. Register your app with Instant
3. Use AuthSession to log in with LinkedIn!

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

Now that you have you App Scheme, it's time to tell Instant about it.

From the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Auth" /%} tab on the Instant dashboard, add a redirect origin of type "App scheme". For development with expo add `exp://` and your scheme, e.g. `mycoolredirect://`.

{% screenshot src="/img/docs/rn-web-redirect-origins.png" /%}

**Use AuthSession to log in with LinkedIn!**

And from here you're ready to add a login button to your expo app! Here's a full example

```javascript {% showCopy=true %}
import { View, Text, Button, StyleSheet } from 'react-native';
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
      <db.SignedIn loading={<Text>Loading...</Text>}>
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
  return <Text>Hello {user.email}!</Text>;
}

function Login() {
  const discovery = useAutoDiscovery(db.auth.issuerURI());
  const [request, _response, promptAsync] = useAuthRequest(
    {
      // The unique name you gave the OAuth client when you
      // registered it on the Instant dashboard
      clientId: 'YOUR_INSTANT_AUTH_CLIENT_NAME',
      redirectUri: makeRedirectUri(),
    },
    discovery,
  );

  return (
    <Button
      title="Log in"
      disabled={!request}
      onPress={async () => {
        try {
          const res = await promptAsync();
          if (res.type === 'error') {
            alert(res.error || 'Something went wrong');
          }
          if (res.type === 'success') {
            await db.auth
              .exchangeOAuthCode({
                code: res.params.code,
                codeVerifier: request.codeVerifier,
              })
              .catch((e) => alert(e.body?.message || 'Something went wrong'));
          } else {
          }
        } catch (e) {
          console.error(e);
        }
      }}
    ></Button>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

{% /conditional %}

{% /nav-default %}
