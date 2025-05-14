---
title: Google OAuth
description: How to add Google OAuth to your Instant app.
---

{% nav-default value="web-google-button" %}

Instant supports logging users in with their Google account. There are a few ways to do this: it depends on whether you are building for web or React Native.

Choose the option that sounds best to you, and the rest of the document will show you how to add Sign in with Google to your app.

{% div className="not-prose" %}
{% div className="grid md:grid-cols-2 gap-4" %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for Web?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-2 flex-1 gap-4" %}
{% nav-button
  title="Google Button"
  description="Use Google's pre-styled button to sign in. Using this method you can render your custom app name in the consent screen"
  param="method"
  value="web-google-button"
  recommended=true /%}
{% nav-button
  title="Web Redirect"
  description="Easier to integrate, but doesn't let you render your custom app name."
  param="method"
  value="web-redirect" /%}
{% /div %}
{% /div %}
{% div className="h-full flex flex-col space-y-4" %}
**Building for React Native?**
{% div className="grid grid-cols-2 md:grid-cols-1 md:grid-rows-2 flex-1 gap-4" %}
{% nav-button
  title="Native Auth"
  description="Use a 'react-native-google-signin', to integrate with the native Google iOS and Android flows. Lets you render your custom app name in the consent screen"
  param="method"
  value="rn-native"
  recommended=true /%}
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

1. **Google Console**: Set up your consent screen and create an Oauth client.
2. **Instant Dashboard**: Connect your Oauth client to Instant
3. **Your app**: Add some code to log in with Google!

Let's dive deeper in each step:

## 1. Set up your consent screen and create an Oauth client

Head on over to {% blank-link href="https://console.cloud.google.com/apis/credentials" label="Google Console" /%}. You should be in the "Credentials" section.

**Configure your Google OAuth consent screen**

- Click "CONFIGURE CONSENT SCREEN." If you already have a consent screen, you can skip to the next step.
- Select "External" and click "CREATE".
- Add your app's name, a support email, and developer contact information. Click "Save and continue".
- No need to add scopes or test users. Click "Save and continue" for the next screens. Until you reach the "Summary" screen, click "Back to dashboard".

**Create an OAuth client for Google**

{% conditional
   param="method"
   value=["web-google-button", "web-redirect", "rn-web"] %}

- From Google Console, click "+ CREATE CREDENTIALS"
- Select "OAuth client ID"
- Select "Web application" as the application type.
- Add `https://api.instantdb.com/runtime/oauth/callback` as an Authorized redirect URI.
- If you're testing from localhost, **add both `http://localhost`** and `http://localhost:3000` to "Authorized JavaScript origins", replacing `3000` with the port you use.
- For production, add your website's domain.

And with that you have your Oauth client!

{% callout type="note" %}

Save your Client ID and your Client Secret -- you'll need it for the next step!

{% /callout %}

{% /conditional %}

{% conditional
   param="method"
   value=["rn-native"] %}

For native auth, each platform needs an Oauth Client. If you support both iOS or Android for example, you'll create two clients. Here are the steps:

- From Google Console, click "+ CREATE CREDENTIALS"
- Select "OAuth client ID"
- Select "iOS" or "Android" as the application type.
- Fill in your bundle information.

And with that you ready!

{% callout type="note" %}

Save your Client IDs -- you'll need it for the next step!

{% /callout %}

{% /conditional %}

## 2. Connect your Oauth client to Instant

{% conditional
   param="method"
   value=["web-google-button", "web-redirect", "rn-web"] %}

Go to the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Instant dashboard" /%} and select the `Auth` tab for your app.

**Add your Oauth Client on Instant**

- Click "Set up Google"
- Enter your "Client ID"
- Enter your "Client Secret"
- Check "I added the redirect to Google" (make sure you actually did this!)
- Click "Add Client"

And voila, you are connected!

{% /conditional %}

{% conditional
   param="method"
   value=["web-google-button", "web-redirect"] %}

**Register your website with Instant**

In the `Auth` tab, add the url of the websites where you are using Instant to the Redirect Origins.
If you're testing from localhost, add `http://localhost:3000`, replacing `3000` with the port you use.
For production, add your website's domain.

{% /conditional %}

{% conditional
   param="method"
   value=["rn-native"] %}

Go to the {% blank-link href="http://instantdb.com/dash?s=main&t=auth" label="Instant dashboard" /%} and select the `Auth` tab for your app. For each Oauth Client you created, add it to Instant:

- Click "Set up Google"
- Enter your "Client ID"
- Make sure "skip nonce checks" is enabled.
- Click "Add Client"

And voila, you are connected!

{% /conditional %}

## 3. Add some code!

{% conditional param="method" value="web-google-button" %}

**Method: Google Sign in Button for Web**

We'll use {% blank-link href="https://developers.google.com/identity/gsi/web/guides/overview" label="Google's pre-built Sign in Button" /%}. The benefit of using Google's button is that you can display your app's name in the consent screen.

There two steps to the code:

1. Use the Sign in Button to auth with Google and get an `idToken`
2. Pass the token on to `db.auth.signInWithIdToken`, and you are logged in!

Let's do that.

**Using React**

If you're using React, the easiest way to include the Sign in Button is through the {% blank-link href="https://github.com/MomenSherif/react-oauth" label="@react-oauth/google" /%} package:

```shell
npm install @react-oauth/google
```

Once you install it, include the button, and use `db.auth.signInWithIdToken` to complete sign in. Here's a full example:

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

// e.g. 89602129-cuf0j.apps.googleusercontent.com
const GOOGLE_CLIENT_ID = 'REPLACE_ME';

// Use the google client name in the Instant dashboard auth tab
const GOOGLE_CLIENT_NAME = 'REPLACE_ME';

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <h1>Hello {user.email}!</h1>;
  }

  return <Login />;
}

function Login() {
  const [nonce] = useState(crypto.randomUUID());

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleLogin
        nonce={nonce}
        onError={() => alert('Login failed')}
        onSuccess={({ credential }) => {
          db.auth
            .signInWithIdToken({
              clientName: GOOGLE_CLIENT_NAME,
              idToken: credential,
              // Make sure this is the same nonce you passed as a prop
              // to the GoogleLogin button
              nonce,
            })
            .catch((err) => {
              alert('Uh oh: ' + err.body?.message);
            });
        }}
      />
    </GoogleOAuthProvider>
  );
}
```

**Not using React?**

If you're not using React or prefer to embed the button yourself, refer to {% blank-link href="https://developers.google.com/identity/gsi/web/guides/overview" label="Google's docs" /%} on how to create the button and load their client library

When creating your button, make sure to set the `data-ux_mode="popup"`. Your `data-callback` function should look like:

```javascript {% showCopy=true %}
async function handleSignInWithGoogle(response) {
  await db.auth.signInWithIdToken({
    // Use the google client name in the Instant dashboard auth tab
    clientName: 'REPLACE_ME',
    idToken: response.credential,
    // make sure this is the same nonce you set in data-nonce
    nonce: 'REPLACE_ME',
  });
}
```

{% /conditional %}

{% conditional param="method" value="web-redirect" %}

**Method: Web Redirect**

If you don't want to use the google styled buttons, you can use the redirect flow instead.

Create an authorization URL via `db.auth.createAuthorizationURL` and then use the url to create a link. Here's a full example:

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';

const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

const url = db.auth.createAuthorizationURL({
  // Use the google client name in the Instant dashboard auth tab
  clientName: 'REPLACE_ME',
  redirectURL: window.location.href,
});

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <h1>Hello {user.email}!</h1>;
  }

  return <Login />;
}

function Login() {
  return <a href={url}>Log in with Google</a>;
}
```

When your users clicks on the link, they'll be redirected to Google to start the OAuth flow and then back to your site.

Instant will automatically log them in to your app when they are redirected!

{% /conditional %}

{% conditional param="method" value="rn-web" %}

**Method: Expo Web Auth**

Instant comes with support for Expo's AuthSession library. To use it, you need to:

1. Set up AuthSession
2. Register your app with Instant
3. Use AuthSession to log in with Google!

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

**Use AuthSession to log in with Google!**

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
  const { isLoading, user, error } = db.useAuth();

  let content;
  if (isLoading) {
    content = <Text>Loading...</Text>;
  } else if (error) {
    content = <Text>Uh oh! {error.message}</Text>;
  } else if (user) {
    content = <Text>Hello {user.email}!</Text>;
  } else {
    content = <Login />;
  }

  return <View style={styles.container}>{content}</View>;
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

{% conditional param="method" value="rn-native" %}

**Method: Native Auth**

You can use [react-native-google-signin/google-signin](https://github.com/react-native-google-signin/google-signin), to authenticate natively on Google.

There are three steps:

1. Set up google-signin on Expo
1. Use the Sign in Button to auth with Google and get an `idToken`
1. Pass the token on to `db.auth.signInWithIdToken`, and you are logged in!

Let's do that.

**Set up google-signin on Expo**

First, let's install the package:

```
npx expo install @react-native-google-signin/google-signin
```

Then, follow the google-signin {% blank-link href="https://react-native-google-signin.github.io/docs/setting-up/expo/" label="installation instructions" /%} to set it up with Expo.

**Use google-signin to log in with Google!**

Now you're ready to add the Google Signin button to your expo app! Here's a full example:

```javascript {% showCopy=true %}
import { View, Text, Button, StyleSheet } from 'react-native';
import { init } from '@instantdb/react-native';
import {
  GoogleSignin,
  GoogleSigninButton,
} from '@react-native-google-signin/google-signin';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

GoogleSignin.configure({
  // See https://react-native-google-signin.github.io/docs/original#configure
  iosClientId: 'YOUR_IOS_CLIENT_ID',
});

function App() {
  const { isLoading, user, error } = db.useAuth();

  let content;
  if (isLoading) {
    content = <Text>Loading...</Text>;
  } else if (error) {
    content = <Text>Uh oh! {error.message}</Text>;
  } else if (user) {
    content = <Text>Hello {user.email}!</Text>;
  } else {
    content = <Login />;
  }

  return <View style={styles.container}>{content}</View>;
}

function Login() {
  return (
    <GoogleSigninButton
      size={GoogleSigninButton.Size.Wide}
      color={GoogleSigninButton.Color.Dark}
      onPress={async () => {
        // 1. Sign in to Google
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;

        if (!idToken) {
          console.error('no ID token present!');
          return;
        }
        // 2. Use your token, and sign into InstantDB!
        try {
          const res = await db.auth.signInWithIdToken({
            // The unique name you gave the OAuth client when you
            // registered it on the Instant dashboard
            clientId: 'YOUR_INSTANT_AUTH_CLIENT_NAME',
            idToken,
          });
          console.log('logged in!', res);
        } catch (error) {
          console.log('error signing in', error);
        }
      }}
    />
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
