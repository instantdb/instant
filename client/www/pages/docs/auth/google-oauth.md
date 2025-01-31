---
title: Google OAuth
---

{% nav-default value="native" %}

Instant supports logging in your users with their Google account.
We support flows for Web and React Native. Follow the steps below to get started.

**Step 1: Configure OAuth consent screen**
Go to the [Google Console](https://console.cloud.google.com/apis/credentials).

Click "CONFIGURE CONSENT SCREEN." If you already have a consent screen, you can skip to the next step.

Select "External" and click "CREATE".

Add your app's name, a support email, and developer contact information. Click "Save and continue".

No need to add scopes or test users. Click "Save and continue" for the next
screens. Until you reach the "Summary" screen, click "Back to dashboard".

**Step 2: Create an OAuth client for Google**
From Google Console, click "+ CREATE CREDENTIALS"

Select "OAuth client ID"

Select "Web application" as the application type.

Add `https://api.instantdb.com/runtime/oauth/callback` as an Authorized redirect URI.

If you're testing from localhost, **add both `http://localhost`** and `http://localhost:3000` to "Authorized JavaScript origins", replacing `3000` with the port you use.
For production, add your website's domain.

**Step 3: Register your OAuth client with Instant**

Go to the Instant dashboard and select the `Auth` tab for your app.

Register a Google client and enter the client id and client secret from the OAuth client that you created.

**Step 4: Register your website with Instant**

In the `Auth` tab, add the url of the websites where you are using Instant to the Redirect Origins.
If you're testing from localhost, add `http://localhost:3000`, replacing `3000` with the port you use.
For production, add your website's domain.

**Step 5: Add login to your app**

The next sections will show you how to use your configured OAuth client with Instant.

{% nav-group %}
  {% nav-button param="method" value="native"
            title="Native Button (Web)"
            description="Use Google's pre-styled button to sign in. Using this method you can render your custom app name in the consent screen (Recommended)"
            /%}
  {% nav-button param="method" value="redirect"
            title="Redirect flow (Web)"
            description="Easier to integrate, but doesn't let you render your custom app name."
            /%}
  {% nav-button param="method" value="rn-webflow"
            title="React Native"
            description="Add Google OAuth to your RN app with our webflow integration."
            /%}
{% /nav-group %}

{% conditional param="method" value="native" %}

## Native button for Web

You can use [Google's Sign in Button](https://developers.google.com/identity/gsi/web/guides/overview) with Instant. You'll use `db.auth.SignInWithIdToken` to authenticate your user.
The benefit of using Google's button is that you can display your app's name in the consent screen.

First, make sure that your website is in the list of "Authorized JavaScript origins" for your Google client on the [Google console](https://console.cloud.google.com/apis/credentials).

If you're using React, the easiest way to include the signin button is through the [`@react-oauth/google` package](https://github.com/MomenSherif/react-oauth).

```shell
npm install @react-oauth/google
```

Include the button and use `db.auth.signInWithIdToken` to complete sign in.
Here's a full example

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const APP_ID = "__APP_ID__";

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

If you're not using React or prefer to embed the button yourself, refer to [Google's docs on how to create the button and load their client library](https://developers.google.com/identity/gsi/web/guides/overview). When creating your button, make sure to set the `data-ux_mode="popup"`. Your `data-callback` function should look like:

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

{% conditional param="method" value="redirect" %}
## Redirect flow for Web

If you don't want to use the google styled buttons, you can use the redirect flow instead.

Simply create an authorization URL via `db.auth.createAuthorizationURL` and then use the url to create a link. Here's a full example:

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';

const APP_ID = "__APP_ID__";

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
  return (
    <a href={url}>Log in with Google</a>
  );
}
```

When your users clicks on the link, they'll be redirected to Google to start the OAuth flow and then back to your site. Instant will automatically log them in to your app when they are redirected.

{% /conditional %}


{% conditional param="method" value="rn-webflow" %}
## Webview flow on React Native

Instant comes with support for Expo's AuthSession library. If you haven't already, follow the AuthSession [installation instructions from the Expo docs](https://docs.expo.dev/versions/latest/sdk/auth-session/).

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

From the Auth tab on the Instant dashboard, add a redirect origin of type "App scheme". For development with expo add `exp://` and your scheme, e.g. `mycoolredirect://`.

Now you're ready to add a login button to your expo app. Here's a full example

```javascript {% showCopy=true %}
import { View, Text, Button, StyleSheet } from 'react-native';
import { init } from '@instantdb/react-native';
import {
  makeRedirectUri,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';

const APP_ID = "__APP_ID__";
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
    discovery
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